import { isAsyncGeneratorFunction } from '@xstd/async-generator';
import { block } from '@xstd/block';
import { CompleteError } from '@xstd/custom-error';
import { listen } from '@xstd/disposable';
import { MapFunction } from '@xstd/functional';
import { asyncIteratorReturnAll } from '../../../shared/functions/.private/async-iterator-return-all.js';
import { iteratorReturnAll } from '../../../shared/functions/.private/iterator-return-all.js';
import { type WritableStreamFactory } from '../../../shared/types/writable-stream-factory.js';
import {
  AsyncFlowFactory,
  type AsyncFlowFactoryOpenCallback,
} from '../../flow/factory/async-flow-factory.js';
import { AsyncWriter } from '../writer/async-writer.js';
import { type AsyncWritableSource } from './types/misc/async-writable-source.js';

export type AsyncWritableOpenCallback<GValue> = AsyncFlowFactoryOpenCallback<AsyncWriter<GValue>>;

export class AsyncWritable<GValue> extends AsyncFlowFactory<AsyncWriter<GValue>> {
  static from<GValue>(input: AsyncWritableSource<GValue>): AsyncWritable<GValue> {
    if (input instanceof AsyncWritable) {
      return input;
    }

    if (isAsyncGeneratorFunction<[signal: AbortSignal], void, void, GValue>(input)) {
      return new AsyncWritable<GValue>(
        async (signal?: AbortSignal): Promise<AsyncWriter<GValue>> => {
          const controller = new AbortController();
          const iterator: AsyncGenerator<void, void, GValue> = input(controller.signal);

          if (signal === undefined) {
            await iterator.next();
          } else {
            await block(async (): Promise<void> => {
              using _signalListener: Disposable = listen(signal, 'abort', (): void => {
                controller.abort(signal.reason);
              });

              await iterator.next();
            });
          }

          return new AsyncWriter<GValue>(
            async (value: GValue, signal: AbortSignal): Promise<void> => {
              using _signalListener: Disposable = listen(signal, 'abort', (): void => {
                controller.abort(signal.reason);
              });

              const { done } = await iterator.next(value);

              if (done) {
                throw new CompleteError();
              }
            },
            (reason: unknown): Promise<void> => {
              controller.abort(reason);
              return asyncIteratorReturnAll(iterator);
            },
          );
        },
      );
    }

    if (Symbol.asyncIterator in input) {
      return new AsyncWritable<GValue>(
        async (signal?: AbortSignal): Promise<AsyncWriter<GValue>> => {
          const iterator: AsyncIterator<void, void, GValue> = input[Symbol.asyncIterator]();

          await iterator.next();

          signal?.throwIfAborted();

          return new AsyncWriter<GValue>(
            async (value: GValue): Promise<void> => {
              const { done } = await iterator.next(value);

              if (done) {
                throw new CompleteError();
              }
            },
            (): Promise<void> => {
              return asyncIteratorReturnAll(iterator);
            },
          );
        },
      );
    }

    if (Symbol.iterator in input) {
      return new AsyncWritable<GValue>((): AsyncWriter<GValue> => {
        const iterator: Iterator<void, void, GValue> = input[Symbol.iterator]();

        iterator.next();

        return new AsyncWriter<GValue>(
          (value: GValue): void => {
            const { done } = iterator.next(value);

            if (done) {
              throw new CompleteError();
            }
          },
          (): void => {
            iteratorReturnAll(iterator);
          },
        );
      });
    }

    throw new Error('Invalid input.');
  }

  static fromWritableStreamFactory<GValue>(
    factory: WritableStreamFactory<GValue>,
  ): AsyncWritable<GValue> {
    return new AsyncWritable<GValue>(async (signal?: AbortSignal): Promise<AsyncWriter<GValue>> => {
      const writer: WritableStreamDefaultWriter<GValue> = (await factory(signal)).getWriter();

      return new AsyncWriter<GValue>(
        async (value: GValue, signal: AbortSignal): Promise<void> => {
          using _signalListener: Disposable = listen(signal, 'abort', (): void => {
            writer.abort(signal.reason);
          });

          await writer.write(value);
        },
        (reason: unknown): Promise<void> => {
          return writer.abort(reason);
        },
      );
    });
  }

  /**
   * Returns a new `AsyncWritable` whose `next` values are _mapped_ using the function `mapFnc`.
   *
   * @example: multiply values by `2`
   *
   * ```ts
   * await AsyncWritable.from(async function *() { console.log(yield); }).map(v => v * 2).pushMany([1, 2, 3]); // [2, 4, 6]
   * ```
   */
  map<GNewValue>(mapFnc: MapFunction<GNewValue, GValue>): AsyncWritable<GNewValue> {
    return new AsyncWritable<GNewValue>(
      async (signal?: AbortSignal): Promise<AsyncWriter<GNewValue>> => {
        const writer: AsyncWriter<GValue> = await this.open(signal);

        return new AsyncWriter<GNewValue>(
          (value: GNewValue): Promise<void> => {
            return writer.next(mapFnc(value));
          },
          (reason: unknown): Promise<void> => {
            return writer.close(reason);
          },
        );
      },
    );
  }

  // Promise based return

  /**
   * @experimental
   */
  async pushMany(
    values: AsyncIterable<GValue> | Iterable<GValue>,
    signal?: AbortSignal,
  ): Promise<void> {
    await using writer: AsyncWriter<GValue> = await this.open(signal);

    using stack: DisposableStack = new DisposableStack();

    if (signal !== undefined) {
      stack.use(
        listen(signal, 'abort', (): void => {
          writer.close(signal.reason);
        }),
      );
    }

    const iterator: AsyncIterator<GValue> | Iterator<GValue> =
      Symbol.asyncIterator in values
        ? (values[Symbol.asyncIterator]() as AsyncIterator<GValue>)
        : (values[Symbol.iterator]() as Iterator<GValue>);
    let result: IteratorResult<GValue>;

    while (!(result = await iterator.next()).done) {
      await writer.next(result.value);
    }
  }
}
