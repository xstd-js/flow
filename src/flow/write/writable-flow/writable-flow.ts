import { listen } from '@xstd/disposable';
import { MapFunction } from '@xstd/functional';
import { FlowFactory } from '../../base/flow-factory/flow-factory.js';
import { FlowWriter } from '../flow-writer/flow-writer.js';

export class WritableFlow<GValue> extends FlowFactory<FlowWriter<GValue>> {
  /**
   * Returns a new `WritableFlow` whose `written` values are _mapped_ using the function `mapFnc`.
   *
   * @example: multiply values by `2`
   *
   * ```ts
   * await WritableFlow.from(async function *() { console.log(yield); }).map(v => v * 2).pushMany([1, 2, 3]); // [2, 4, 6]
   * ```
   */
  map<GNewValue>(mapFnc: MapFunction<GNewValue, GValue>): WritableFlow<GNewValue> {
    return new WritableFlow<GNewValue>(
      async (signal?: AbortSignal): Promise<FlowWriter<GNewValue>> => {
        const writer: FlowWriter<GValue> = await this.open(signal);

        return new FlowWriter<GNewValue>(
          (value: GNewValue): Promise<void> => {
            return writer.write(mapFnc(value));
          },
          (reason: unknown): Promise<void> => {
            return writer.close(reason);
          },
        );
      },
    );
  }

  // Promise based return

  async once(value: GValue, signal?: AbortSignal): Promise<void> {
    await using writer: FlowWriter<GValue> = await this.open(signal);

    using stack: DisposableStack = new DisposableStack();

    if (signal !== undefined) {
      stack.use(
        listen(signal, 'abort', (): void => {
          writer.close(signal.reason);
        }),
      );
    }

    await writer.write(value);
  }

  /**
   * @experimental
   */
  async pushMany(
    values: AsyncIterable<GValue> | Iterable<GValue>,
    signal?: AbortSignal,
  ): Promise<void> {
    await using writer: FlowWriter<GValue> = await this.open(signal);

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
      await writer.write(result.value);
    }
  }
}
