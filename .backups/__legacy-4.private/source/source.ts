import { isAsyncGeneratorFunction } from '@xstd/async-generator';
import { rejectPromiseWhenSignalIsAborted, sleep } from '@xstd/async-task';
import { CompleteError } from '@xstd/custom-error';
import { listen } from '@xstd/disposable';
import {
  FilterFunction,
  FilterFunctionWithSubType,
  MapFilterFunction,
  MapFunction,
} from '@xstd/functional';
import { SharedResource, SharedResourceFactory, SharedResourceLike } from '@xstd/shared-resource';
import { ReadableFlowSyncBridge } from '../flow/bridge/readable-flow-sync-bridge.js';
import { PushToPullOptions } from '../flow/bridge/types/push-to-pull-options.js';
import { ReadableFlow } from '../flow/readable/readable-flow.js';
import { ActiveResourceCollection } from '../resource/active-resource/collection/active-resource-collection.js';
import {
  SuspendedResourceCollection,
  SuspendedResourceCollectionItemsToActiveResourceCollectionItems,
} from '../resource/suspended-resource/collection/suspended-resource-collection.js';
import { SuspendedResource } from '../resource/suspended-resource/suspended-resource.js';
import { tryAsyncFnc } from '../shared/enum/result/functions/try-async-fnc.js';
import { isResultOk } from '../shared/enum/result/ok/is-result-ok.js';
import { Result } from '../shared/enum/result/result.js';
import { asyncIteratorReturnAll } from '../shared/functions/.private/async-iterator-return-all.js';
import { iteratorReturnAll } from '../shared/functions/.private/iterator-return-all.js';
import { SourceFlatMapErrorFunction } from './types/methods/flat-map/source-flat-map-error-function.js';
import { SourceFlatMapNextFunction } from './types/methods/flat-map/source-flat-map-next-function.js';
import type { SourceForEachFunction } from './types/methods/for-each/source-for-each-function.js';
import { SourceInspectOptions } from './types/methods/inspect/source-inspect-options.js';
import { SourceRateLimitOptions } from './types/methods/rate-limit/source-rate-limit-options.js';
import { SourceLike } from './types/source-like.js';

export class Source<GValue> extends SuspendedResource<ReadableFlow<GValue>> {
  /**
   * Creates a `Source` from:
   *  - a `Source`
   *  - or an `AsyncGeneratorFunction`
   *  - or an `AsyncIterable`
   *  - or an `Iterable`
   *  - or a `Promise`
   */
  static from<GValue>(input: SourceLike<GValue>): Source<GValue> {
    if (input instanceof Source) {
      return input;
    }

    if (isAsyncGeneratorFunction<[signal: AbortSignal], GValue, void, void>(input)) {
      return this.#fromAsyncGeneratorFunction<GValue>(input);
    }

    if (Symbol.asyncIterator in input) {
      return this.#fromAsyncIterable<GValue>(input);
    }

    if (Symbol.iterator in input) {
      return this.#fromIterable<GValue>(input);
    }

    if (input instanceof Promise) {
      return this.#fromPromise<GValue>(input);
    }

    throw new Error('Not a valid SourceLike.');
  }

  static #fromAsyncGeneratorFunction<GValue>(
    fnc: (signal: AbortSignal) => AsyncIterator<GValue, void, void>,
  ): Source<GValue> {
    return new Source<GValue>((): ReadableFlow<GValue> => {
      const controller = new AbortController();
      const iterator: AsyncIterator<GValue, void, void> = fnc(controller.signal);

      return new ReadableFlow<GValue>(
        async (signal: AbortSignal): Promise<GValue> => {
          using _signalListener: Disposable = listen(signal, 'abort', (): void => {
            controller.abort(signal.reason);
          });

          const result: IteratorResult<GValue> = await iterator.next();

          if (result.done) {
            throw new CompleteError();
          }

          return result.value;
        },
        (reason: unknown): Promise<void> => {
          controller.abort(reason);
          return asyncIteratorReturnAll(iterator);
        },
      );
    });
  }

  static #fromAsyncIterable<GValue>(iterable: AsyncIterable<GValue>): Source<GValue> {
    return this.#fromAsyncGeneratorFunction(iterable[Symbol.asyncIterator]);
  }

  static #fromIterable<GValue>(iterable: Iterable<GValue>): Source<GValue> {
    return new Source<GValue>((): ReadableFlow<GValue> => {
      const iterator: Iterator<GValue> = iterable[Symbol.iterator]();

      return new ReadableFlow<GValue>(
        (): GValue => {
          const result: IteratorResult<GValue> = iterator.next();

          if (result.done) {
            throw new CompleteError();
          }

          return result.value;
        },
        (): void => {
          iteratorReturnAll(iterator);
        },
      );
    });
  }

  static #fromPromise<GValue>(promise: Promise<GValue>): Source<GValue> {
    return new Source<GValue>((): ReadableFlow<GValue> => {
      let done: boolean = false;

      return new ReadableFlow<GValue>(
        async (): Promise<GValue> => {
          if (done) {
            throw new CompleteError();
          }

          try {
            return await promise;
          } finally {
            done = true;
          }
        },
        (): void => {},
      );
    });
  }

  /**
   * Creates a `Source` from an `EventTarget`.
   */
  static when<GEvent extends Event>(
    target: EventTarget,
    type: string,
    options?: PushToPullOptions,
  ): Source<GEvent> {
    return new Source<GEvent>((): ReadableFlow<GEvent> => {
      const bridge = new ReadableFlowSyncBridge<GEvent>({
        ...options,
        close: (): void => {
          stopListener[Symbol.dispose]();
        },
      });

      const stopListener: Disposable = listen(target, type, (event: Event): void => {
        void bridge.write(event as GEvent);
      });

      return bridge.readable;
    });
  }

  /* TRANSFORM THE DATA */

  map<GNewValue>(mapFnc: MapFunction<GValue, GNewValue>): Source<GNewValue> {
    return new Source<GNewValue>(async (signal?: AbortSignal): Promise<ReadableFlow<GNewValue>> => {
      const readable: ReadableFlow<GValue> = await this.open(signal);

      return new ReadableFlow<GNewValue>(
        async (signal: AbortSignal): Promise<GNewValue> => {
          return mapFnc(await readable.read(signal));
        },
        (reason: unknown): Promise<void> => {
          return readable.close(reason);
        },
      );
    });
  }

  filter<GNewValue extends GValue>(
    filterFnc: FilterFunctionWithSubType<GValue, GNewValue>,
  ): Source<GNewValue>;
  filter(filterFnc: FilterFunction<GValue>): Source<GValue>;
  filter(filterFnc: FilterFunction<GValue>): Source<GValue> {
    return new Source<GValue>(async (signal?: AbortSignal): Promise<ReadableFlow<GValue>> => {
      const readable: ReadableFlow<GValue> = await this.open(signal);

      return new ReadableFlow<GValue>(
        async (signal: AbortSignal): Promise<GValue> => {
          while (true) {
            const value: GValue = await readable.read(signal);
            if (filterFnc(value)) {
              return value;
            }
          }
        },
        (reason: unknown): Promise<void> => {
          return readable.close(reason);
        },
      );
    });
  }

  mapFilter<GNewValue>(mapFilterFnc: MapFilterFunction<GValue, GNewValue>): Source<GNewValue> {
    return new Source<GNewValue>(async (signal?: AbortSignal): Promise<ReadableFlow<GNewValue>> => {
      const readable: ReadableFlow<GValue> = await this.open(signal);

      return new ReadableFlow<GNewValue>(
        async (signal: AbortSignal): Promise<GNewValue> => {
          while (true) {
            const value: GNewValue | null = mapFilterFnc(await readable.read(signal));
            if (value !== null) {
              return value;
            }
          }
        },
        (reason: unknown): Promise<void> => {
          return readable.close(reason);
        },
      );
    });
  }

  /* TRUNCATE THE FLOW */

  take(count: number): Source<GValue> {
    return new Source<GValue>(async (signal?: AbortSignal): Promise<ReadableFlow<GValue>> => {
      const readable: ReadableFlow<GValue> = await this.open(signal);

      return new ReadableFlow<GValue>(
        async (signal: AbortSignal): Promise<GValue> => {
          if (count <= 0) {
            throw new CompleteError();
          }
          const value: GValue = await readable.read(signal);
          count--;
          return value;
        },
        (reason: unknown): Promise<void> => {
          return readable.close(reason);
        },
      );
    });
  }

  takeUntil(value: SourceLike<any>): Source<GValue> {
    return new Source<GValue>(async (signal?: AbortSignal): Promise<ReadableFlow<GValue>> => {
      interface GSourceItems {
        readonly notifier: Source<any>;
        readonly reader: Source<GValue>;
      }

      type GReadableFlowsItems =
        SuspendedResourceCollectionItemsToActiveResourceCollectionItems<GSourceItems>;

      const readableFlowCollection: ActiveResourceCollection<GReadableFlowsItems> =
        await new SuspendedResourceCollection<GSourceItems>({
          notifier: Source.from(value),
          reader: this,
        }).open(signal);

      const { notifier, reader } = readableFlowCollection.items;

      let notifierPromise: Promise<never>;

      const untilNotifierResolve = (signal: AbortSignal): Promise<never> => {
        if (notifierPromise === undefined) {
          notifierPromise = notifier.read(signal).then(
            (): never => {
              throw new CompleteError();
            },
            (error: unknown): never | Promise<never> => {
              if (error instanceof CompleteError) {
                return Promise.withResolvers<never>().promise; // never ending promise
              } else {
                throw error;
              }
            },
          );
        }

        return notifierPromise;
      };

      return new ReadableFlow<GValue>(
        (signal: AbortSignal): Promise<GValue> => {
          return Promise.race([reader.read(signal), untilNotifierResolve(signal)]);
        },
        (reason: unknown): Promise<void> => {
          return readableFlowCollection.close(reason);
        },
      );
    });
  }

  drop(count: number): Source<GValue> {
    return new Source<GValue>(async (signal?: AbortSignal): Promise<ReadableFlow<GValue>> => {
      const readable: ReadableFlow<GValue> = await this.open(signal);

      return new ReadableFlow<GValue>(
        async (signal: AbortSignal): Promise<GValue> => {
          while (count > 0) {
            await readable.read(signal);
            count--;
          }
          return readable.read(signal);
        },
        (reason: unknown): Promise<void> => {
          return readable.close(reason);
        },
      );
    });
  }

  /* TRANSFORM THE FLOW */

  flatMap(next?: undefined, error?: undefined): Source<GValue>;
  flatMap<GNewValue>(
    next: SourceFlatMapNextFunction<GValue, GNewValue>,
    error?: undefined,
  ): Source<GNewValue>;
  flatMap<GNewValue>(
    next: undefined,
    error: SourceFlatMapErrorFunction<GNewValue>,
  ): Source<GValue | GNewValue>;
  flatMap<GNewValue>(
    next: SourceFlatMapNextFunction<GValue, GNewValue>,
    error: SourceFlatMapErrorFunction<GNewValue>,
  ): Source<GNewValue>;
  flatMap<GNewValue>(
    next?: SourceFlatMapNextFunction<GValue, GNewValue>,
    error?: SourceFlatMapErrorFunction<GNewValue>,
  ): Source<GValue | GNewValue> {
    if (next === undefined && error === undefined) {
      return this;
    }

    type GOut = GValue | GNewValue;

    return new Source<GOut>(async (signal?: AbortSignal): Promise<ReadableFlow<GOut>> => {
      const readable: ReadableFlow<GValue> = await this.open(signal);
      let innerReadable: ReadableFlow<GOut> | undefined;
      let readableDone: boolean = false;

      return new ReadableFlow<GOut>(
        async (signal: AbortSignal): Promise<GOut> => {
          while (true) {
            if (innerReadable === undefined) {
              const result: Result<GValue> = await tryAsyncFnc<GValue>(
                (): Promise<GValue> => readable.read(signal),
              );

              if (isResultOk(result)) {
                if (next === undefined) {
                  return result.value;
                } else {
                  innerReadable = await Source.from(next(result.value)).open(signal);
                }
              } else {
                readableDone = true;

                if (error === undefined) {
                  throw result.error;
                } else {
                  innerReadable = await Source.from(error(result.error)).open(signal);
                }
              }
            }

            try {
              return await innerReadable.read(signal);
            } catch (error: unknown) {
              if (error instanceof CompleteError) {
                try {
                  await innerReadable.close();
                } finally {
                  innerReadable = undefined;
                }

                if (readableDone) {
                  throw new CompleteError();
                }
              } else {
                throw error;
              }
            }
          }
        },
        async (reason: unknown): Promise<void> => {
          try {
            if (innerReadable !== undefined) {
              await innerReadable.close(reason);
            }
          } finally {
            await readable.close(reason);
          }
        },
      );
    });
  }

  share({
    bufferSize = Number.POSITIVE_INFINITY,
    windowTime = Number.POSITIVE_INFINITY,
  }: PushToPullOptions = {}): Source<GValue> {
    bufferSize = Math.max(0, bufferSize);
    windowTime = Math.max(0, windowTime);

    interface CachedRead<GValue> {
      readonly readPromise: Promise<GValue>;
      readonly expirationDate: number;
    }

    // list of cached reads
    const reads: CachedRead<GValue>[] = [];
    // index of the "next" read
    let readIndex: number = 0;
    // index of the first cached "read" relative to `readIndex`
    let minReadIndex: number = 0;

    const removeExpiredReads = (): void => {
      const now: number = Date.now();
      while (reads.length > 0 && reads[0].expirationDate < now) {
        reads.shift();
        minReadIndex++;
      }
    };

    const sharedReadableFlowFactory: SharedResourceFactory<ReadableFlow<GValue>> =
      new SharedResourceFactory<ReadableFlow<GValue>>(
        async (signal?: AbortSignal): Promise<SharedResourceLike<ReadableFlow<GValue>>> => {
          const readable: ReadableFlow<GValue> = await this.open(signal);

          return {
            ref: readable,
            close: (reason?: unknown): Promise<void> => {
              reads.length = 0;
              readIndex = 0;
              minReadIndex = 0;
              return readable.close(reason);
            },
          };
        },
      );

    return new Source<GValue>(async (signal?: AbortSignal): Promise<ReadableFlow<GValue>> => {
      const sharedReadableFlow: SharedResource<ReadableFlow<GValue>> =
        await sharedReadableFlowFactory.open(signal);

      let localReadIndex: number = 0;

      return new ReadableFlow<GValue>(
        async (signal: AbortSignal): Promise<GValue> => {
          removeExpiredReads();

          localReadIndex = Math.max(localReadIndex, minReadIndex);

          try {
            let readPromise: Promise<GValue>;

            if (localReadIndex < readIndex) {
              // └> we are behind
              // => we have to return a cached read
              readPromise = reads[localReadIndex - minReadIndex].readPromise;
            } else {
              // └> we are ahead
              // => we have to read from the reader
              readPromise = sharedReadableFlow.ref.read();
              readIndex++;

              if (bufferSize > 0 && windowTime > 0) {
                // └> if queueing is asked
                // queue this read
                reads.push({
                  readPromise,
                  expirationDate: Date.now() + windowTime,
                });

                // remove the first cached "read" if the `reads` array's length exceed the max buffer size
                if (reads.length > bufferSize) {
                  reads.shift();
                  minReadIndex++;
                }
              } else {
                minReadIndex = readIndex;
              }
            }

            return await rejectPromiseWhenSignalIsAborted(readPromise, signal);
          } finally {
            localReadIndex++;
          }
        },
        (reason: unknown): Promise<void> => {
          return sharedReadableFlow.close(reason);
        },
      );
    });
  }

  /* INSPECT THE FLOW */

  inspect(options: SourceInspectOptions<GValue> = {}): Source<GValue> {
    const run = <GKey extends keyof SourceInspectOptions<GValue>>(
      key: GKey,
      ...args: Parameters<Required<SourceInspectOptions<GValue>>[GKey]>
    ): void => {
      const fnc: SourceInspectOptions<GValue>[GKey] | undefined = Reflect.get(options, key);
      if (fnc !== undefined) {
        try {
          Reflect.apply(fnc, undefined, args);
        } catch (error: unknown) {
          reportError(error);
        }
      }
    };

    return new Source<GValue>(async (signal?: AbortSignal): Promise<ReadableFlow<GValue>> => {
      const readable: ReadableFlow<GValue> = await this.open(signal);

      run('open');

      return new ReadableFlow<GValue>(
        async (signal: AbortSignal): Promise<GValue> => {
          const result: Result<GValue> = await tryAsyncFnc<GValue>(
            (): Promise<GValue> => readable.read(signal),
          );

          if (isResultOk(result)) {
            run('next', result.value);

            return result.value;
          } else {
            run('error', result.error);

            throw result.error;
          }
        },
        (reason: unknown): Promise<void> => {
          run('close', reason);

          return readable.close(reason);
        },
      );
    });
  }

  finally(finallyFnc: () => PromiseLike<void> | void): Source<GValue> {
    return new Source<GValue>(async (signal?: AbortSignal): Promise<ReadableFlow<GValue>> => {
      const readable: ReadableFlow<GValue> = await this.open(signal);

      return new ReadableFlow<GValue>(
        (signal: AbortSignal): Promise<GValue> => {
          return readable.read(signal);
        },
        async (reason: unknown): Promise<void> => {
          try {
            await finallyFnc();
          } finally {
            await readable.close(reason);
          }
        },
      );
    });
  }

  /* MODIFY THE QUEUE */

  rateLimit(
    duration: number,
    { includeReadDuration = true }: SourceRateLimitOptions = {},
  ): Source<GValue> {
    if (duration <= 0) {
      return this;
    }

    return new Source<GValue>(async (signal?: AbortSignal): Promise<ReadableFlow<GValue>> => {
      const readable: ReadableFlow<GValue> = await this.open(signal);
      let minReadDate: number = Date.now();

      return new ReadableFlow<GValue>(
        async (signal: AbortSignal): Promise<GValue> => {
          const remainingDuration: number = minReadDate - Date.now();

          if (remainingDuration > 0) {
            await sleep(remainingDuration, signal);
          }

          if (includeReadDuration) {
            minReadDate = Date.now() + duration;

            return readable.read(signal);
          } else {
            try {
              return await readable.read(signal);
            } finally {
              minReadDate = Date.now() + duration;
            }
          }
        },
        (reason: unknown): Promise<void> => {
          return readable.close(reason);
        },
      );
    });
  }

  /* PROMISE-BASED RETURN */

  async forEach(callback: SourceForEachFunction<GValue>, signal?: AbortSignal): Promise<void> {
    await using readable: ReadableFlow<GValue> = await this.open(signal);

    using stack: DisposableStack = new DisposableStack();

    if (signal !== undefined) {
      stack.use(
        listen(signal, 'abort', (): void => {
          readable.close(signal.reason);
        }),
      );
    }

    while (true) {
      const result: Result<GValue> = await tryAsyncFnc<GValue>(
        (): Promise<GValue> => readable.read(signal),
      );

      if (isResultOk(result)) {
        await callback(result.value, signal);
      } else {
        if (result.error instanceof CompleteError) {
          return;
        } else {
          throw result.error;
        }
      }
    }
  }

  async toArray(signal?: AbortSignal): Promise<GValue[]> {
    await using readable: ReadableFlow<GValue> = await this.open(signal);

    using stack: DisposableStack = new DisposableStack();

    if (signal !== undefined) {
      stack.use(
        listen(signal, 'abort', (): void => {
          readable.close(signal.reason);
        }),
      );
    }

    const values: GValue[] = [];

    while (true) {
      try {
        values.push(await readable.read(signal));
      } catch (error: unknown) {
        if (error instanceof CompleteError) {
          return values;
        } else {
          throw error;
        }
      }
    }
  }

  async first(signal?: AbortSignal): Promise<GValue> {
    await using readable: ReadableFlow<GValue> = await this.open(signal);

    using stack: DisposableStack = new DisposableStack();

    if (signal !== undefined) {
      stack.use(
        listen(signal, 'abort', (): void => {
          readable.close(signal.reason);
        }),
      );
    }

    try {
      return await readable.read(signal);
    } catch (error: unknown) {
      if (error instanceof CompleteError) {
        throw new Error('Complete without sending a value.');
      }

      throw error;
    }
  }

  async last(signal?: AbortSignal): Promise<GValue> {
    await using readable: ReadableFlow<GValue> = await this.open(signal);

    using stack: DisposableStack = new DisposableStack();

    if (signal !== undefined) {
      stack.use(
        listen(signal, 'abort', (): void => {
          readable.close(signal.reason);
        }),
      );
    }

    while (true) {
      let value: GValue;
      let hasValue: boolean = false;

      try {
        value = await readable.read(signal);
        hasValue = true;
      } catch (error: unknown) {
        if (error instanceof CompleteError) {
          if (hasValue) {
            return value!;
          }
          throw new Error('Complete without sending a value.');
        }

        throw error;
      }
    }
  }

  /* CAST TO OTHER KIND OF STREAMS */

  toReadableStream(): ReadableStream<GValue> {
    let abortController: AbortController = new AbortController();
    let readable: ReadableFlow<GValue>;

    return new ReadableStream({
      start: async (): Promise<void> => {
        readable = await this.open(abortController.signal);
      },
      pull: async (controller: ReadableStreamDefaultController<GValue>): Promise<void> => {
        let value: GValue;

        try {
          value = await readable.read(abortController.signal);
        } catch (error: unknown) {
          if (error instanceof CompleteError) {
            controller.close();
          } else {
            controller.error(error);
          }
          return;
        }

        controller.enqueue(value);
      },
      cancel: async (reason?: any): Promise<void> => {
        abortController.abort(reason);
        await readable.close(reason);
      },
    });
  }

  async *toAsyncGenerator(signal?: AbortSignal): AsyncGenerator<GValue, void, void> {
    await using readable: ReadableFlow<GValue> = await this.open(signal);

    while (true) {
      try {
        yield await readable.read(signal);
      } catch (error: unknown) {
        if (error instanceof CompleteError) {
          return;
        } else {
          throw error;
        }
      }
    }
  }

  [Symbol.asyncIterator](): AsyncGenerator<GValue, void, void> {
    return this.toAsyncGenerator();
  }
}
