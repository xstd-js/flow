import { isAsyncGeneratorFunction } from '@xstd/async-generator';
import { rejectPromiseWhenSignalIsAborted } from '@xstd/async-task';
import { CompleteError } from '@xstd/custom-error';
import { listen } from '@xstd/disposable';
import {
  type FilterFunction,
  type FilterFunctionWithSubType,
  type MapFilterFunction,
  type MapFunction,
} from '@xstd/functional';
import {
  type SharedResource,
  SharedResourceFactory,
  type SharedResourceLike,
} from '@xstd/shared-resource';
import { type PushToPullOptions } from '../../../bridge/push-to-pull-options.js';
import { SyncWriterToAsyncReaderBridge } from '../../../bridge/sync-writer-to-async-reader-bridge.js';
import { asyncIteratorReturnAll } from '../../../shared/functions/.private/async-iterator-return-all.js';
import { iteratorReturnAll } from '../../../shared/functions/.private/iterator-return-all.js';
import { type ReadableStreamFactory } from '../../../shared/types/readable-stream-factory.js';
import {
  AsyncFlowFactory,
  type AsyncFlowFactoryOpenCallback,
} from '../../flow/factory/async-flow-factory.js';
import {
  MultiAsyncFlowFactory,
  type MultiAsyncFlowFactoryItemsToMultiAsyncFlowItems,
} from '../../multi/factory/multi-async-flow-factory.js';
import { MultiAsyncFlow } from '../../multi/flow/multi-async-flow.js';
import { AsyncReader } from '../reader/async-reader.js';
import { type AsyncReadableCatchFunction } from './types/methods/async-readable-catch-function.js';
import { type AsyncReadableInspectOptions } from './types/methods/async-readable-inspect-options.js';
import { type AsyncReadableShareOptions } from './types/methods/async-readable-share-options.js';
import { type AsyncReadableSource } from './types/misc/async-readable-source.js';

export type AsyncReadableOpenCallback<GValue> = AsyncFlowFactoryOpenCallback<AsyncReader<GValue>>;

/**
 * Specialization of an `AsyncFlowFactory` returning `AsyncReader`s.
 */
export class AsyncReadable<GValue> extends AsyncFlowFactory<AsyncReader<GValue>> {
  /**
   * Creates an `AsyncReadable` from:
   *  - an `AsyncReadable`
   *  - or an `AsyncGeneratorFunction`
   *  - or an `AsyncIterable`
   *  - or an `Iterable`
   */
  static from<GValue>(input: AsyncReadableSource<GValue>): AsyncReadable<GValue> {
    if (input instanceof AsyncReadable) {
      return input;
    }

    if (isAsyncGeneratorFunction<[signal: AbortSignal], GValue, void, void>(input)) {
      return new AsyncReadable<GValue>((): AsyncReader<GValue> => {
        const controller = new AbortController();
        const iterator: AsyncGenerator<GValue, void, void> = input(controller.signal);
        return new AsyncReader<GValue>(
          async (signal: AbortSignal): Promise<GValue> => {
            using _signalListener: Disposable = listen(signal, 'abort', (): void => {
              controller.abort(signal.reason);
            });

            const { done, value } = await iterator.next();

            if (done) {
              throw new CompleteError();
            }

            return value;
          },
          (reason: unknown): Promise<void> => {
            controller.abort(reason);
            return asyncIteratorReturnAll(iterator);
          },
        );
      });
    }

    if (Symbol.asyncIterator in input) {
      return new AsyncReadable<GValue>((): AsyncReader<GValue> => {
        const iterator: AsyncIterator<GValue, void, void> = input[Symbol.asyncIterator]();
        return new AsyncReader<GValue>(
          async (): Promise<GValue> => {
            const { done, value } = await iterator.next();

            if (done) {
              throw new CompleteError();
            }

            return value;
          },
          (): Promise<void> => {
            return asyncIteratorReturnAll(iterator);
          },
        );
      });
    }

    if (Symbol.iterator in input) {
      return new AsyncReadable<GValue>((): AsyncReader<GValue> => {
        const iterator: Iterator<GValue, void, void> = input[Symbol.iterator]();
        return new AsyncReader<GValue>(
          (): GValue => {
            const { done, value } = iterator.next();

            if (done) {
              throw new CompleteError();
            }

            return value;
          },
          (): void => {
            iteratorReturnAll(iterator);
          },
        );
      });
    }

    throw new Error('Invalid input.');
  }

  /**
   * Creates an `AsyncReadable` from a function returning a `ReadableStream`.
   */
  static fromReadableStreamFactory<GValue>(
    factory: ReadableStreamFactory<GValue>,
  ): AsyncReadable<GValue> {
    return new AsyncReadable<GValue>(async (signal?: AbortSignal): Promise<AsyncReader<GValue>> => {
      const reader: ReadableStreamDefaultReader<GValue> = (await factory(signal)).getReader();

      return new AsyncReader<GValue>(
        async (signal: AbortSignal): Promise<GValue> => {
          using _signalListener: Disposable = listen(signal, 'abort', (): void => {
            reader.cancel(signal.reason);
          });

          const { done, value } = await reader.read();

          if (done) {
            throw new CompleteError();
          }

          return value;
        },
        (reason: unknown): Promise<void> => {
          return reader.cancel(reason);
        },
      );
    });
  }

  /**
   * Creates an `AsyncReadable` from an `EventTarget`.
   */
  static when<GEvent extends Event>(
    target: EventTarget,
    type: string,
    options?: PushToPullOptions,
  ): AsyncReadable<GEvent> {
    return new AsyncReadable<GEvent>((): AsyncReader<GEvent> => {
      const bridge = new SyncWriterToAsyncReaderBridge<GEvent>({
        ...options,
        close: (reason?: unknown): void => {
          stopListener[Symbol.dispose]();
          bridge.writer.close(reason);
        },
      });

      const stopListener: Disposable = listen(target, type, (event: Event): void => {
        bridge.writer.next(event as GEvent);
      });

      return bridge.reader;
    });
  }

  inspect({
    open,
    next,
    error,
    abort,
  }: AsyncReadableInspectOptions<GValue> = {}): AsyncReadable<GValue> {
    return new AsyncReadable<GValue>(async (signal?: AbortSignal): Promise<AsyncReader<GValue>> => {
      const reader: AsyncReader<GValue> = await this.open(signal);

      if (open !== undefined) {
        try {
          open();
        } catch (_error: unknown) {
          reportError(_error);
        }
      }

      return new AsyncReader<GValue>(
        async (): Promise<GValue> => {
          let value: GValue;

          try {
            value = await reader.next();
          } catch (_error: unknown) {
            if (error !== undefined) {
              try {
                error(_error);
              } catch (_error: unknown) {
                reportError(_error);
              }
            }
            throw _error;
          }

          if (next !== undefined) {
            try {
              next(value);
            } catch (_error: unknown) {
              reportError(_error);
            }
          }

          return value;
        },
        async (reason: unknown): Promise<void> => {
          if (abort !== undefined) {
            try {
              abort(reason);
            } catch (_error: unknown) {
              reportError(_error);
            }
          }
          return reader.close(reason);
        },
      );
    });
  }

  /**
   * Returns a new `AsyncReadable` whose `next` values are _mapped_ using the function `mapFnc`.
   *
   * @example: multiply values by `2`
   *
   * ```ts
   * await AsyncReadable.from([1, 2, 3]).map(v => v * 2).toArray(); // [2, 4, 6]
   * ```
   */
  map<GNewValue>(mapFnc: MapFunction<GValue, GNewValue>): AsyncReadable<GNewValue> {
    return new AsyncReadable<GNewValue>(
      async (signal?: AbortSignal): Promise<AsyncReader<GNewValue>> => {
        const reader: AsyncReader<GValue> = await this.open(signal);

        return new AsyncReader<GNewValue>(
          async (): Promise<GNewValue> => {
            return mapFnc(await reader.next());
          },
          (reason: unknown): Promise<void> => {
            return reader.close(reason);
          },
        );
      },
    );
  }

  /**
   * Returns a new `AsyncReadable` whose `next` values are _filtered_ using the function `filterFnc`.
   *
   * @example: keeps only even values
   *
   * ```ts
   * await AsyncReadable.from([1, 2, 3, 4]).filter(v => v % 2 === 0).toArray(); // [2, 4]
   * ```
   */
  filter<GNewValue extends GValue>(
    filterFnc: FilterFunctionWithSubType<GValue, GNewValue>,
  ): AsyncReadable<GNewValue>;
  filter(filterFnc: FilterFunction<GValue>): AsyncReadable<GValue>;
  filter(filterFnc: FilterFunction<GValue>): AsyncReadable<GValue> {
    return new AsyncReadable<GValue>(async (signal?: AbortSignal): Promise<AsyncReader<GValue>> => {
      const reader: AsyncReader<GValue> = await this.open(signal);

      return new AsyncReader<GValue>(
        async (): Promise<GValue> => {
          while (true) {
            const value: GValue = await reader.next();
            if (filterFnc(value)) {
              return value;
            }
          }
        },
        (reason: unknown): Promise<void> => {
          return reader.close(reason);
        },
      );
    });
  }

  /**
   * TODO doc
   * @experimental
   */
  mapFilter<GNewValue>(
    mapFilterFnc: MapFilterFunction<GValue, GNewValue>,
  ): AsyncReadable<GNewValue> {
    return new AsyncReadable<GNewValue>(
      async (signal?: AbortSignal): Promise<AsyncReader<GNewValue>> => {
        const reader: AsyncReader<GValue> = await this.open(signal);

        return new AsyncReader<GNewValue>(
          async (): Promise<GNewValue> => {
            while (true) {
              const value: GNewValue | null = mapFilterFnc(await reader.next());
              if (value !== null) {
                return value;
              }
            }
          },
          (reason: unknown): Promise<void> => {
            return reader.close(reason);
          },
        );
      },
    );
  }

  /**
   * Returns a new `AsyncReadable` (named `output`) following this algorithm:
   *
   * 1. await `this.next()`
   * 2. when resolved, convert the return of this function into an opened `AsyncReadable` (named `innerReader`),
   *   and `output` return the values sent by `innerReader`.
   * 3. if `innerReader` _completes_, then loop on (1).
   *
   *
   * @example
   *
   * ```ts
   * await AsyncReadable.from([1, 2]).flatMap(v => AsyncReadable.from([`${v}-a`, `${v}-b`])).toArray(); // ['1-a', '1-b', '2-a', '2-b']
   * ```
   */
  flatMap<GNewValue>(
    mapFnc: MapFunction<GValue, AsyncReadableSource<GNewValue>>,
  ): AsyncReadable<GNewValue> {
    return new AsyncReadable<GNewValue>(
      async (signal?: AbortSignal): Promise<AsyncReader<GNewValue>> => {
        const reader: AsyncReader<GValue> = await this.open(signal);
        let innerReader: AsyncReader<GNewValue> | undefined;

        return new AsyncReader<GNewValue>(
          async (signal: AbortSignal): Promise<GNewValue> => {
            while (true) {
              if (innerReader === undefined) {
                innerReader = await AsyncReadable.from(mapFnc(await reader.next())).open(signal);
              }

              try {
                return await innerReader.next();
              } catch (error: unknown) {
                if (error instanceof CompleteError) {
                  innerReader = undefined;
                } else {
                  throw error;
                }
              }
            }
          },
          async (reason: unknown): Promise<void> => {
            try {
              if (innerReader !== undefined) {
                await innerReader.close(reason);
              }
            } finally {
              await reader.close(reason);
            }
          },
        );
      },
    );
  }

  /**
   * TODO doc
   * @experimental
   */
  catch<GNewValue>(
    callback: AsyncReadableCatchFunction<GNewValue>,
  ): AsyncReadable<GValue | GNewValue> {
    return new AsyncReadable<GValue | GNewValue>(
      async (signal?: AbortSignal): Promise<AsyncReader<GValue | GNewValue>> => {
        const reader: AsyncReader<GValue> = await this.open(signal);
        let innerReader: AsyncReader<GNewValue> | undefined;

        return new AsyncReader<GValue | GNewValue>(
          async (): Promise<GValue | GNewValue> => {
            if (innerReader === undefined) {
              try {
                return await reader.next();
              } catch (error: unknown) {
                if (error instanceof CompleteError) {
                  throw error;
                } else {
                  innerReader = await AsyncReadable.from<GNewValue>(callback(error)).open(signal);
                }
              }
            }

            return await innerReader.next();
          },
          async (reason: unknown): Promise<void> => {
            return reader.close(reason);
          },
        );
      },
    );
  }

  /**
   * TODO doc
   * @experimental
   */
  finally(finallyFnc: () => PromiseLike<void> | void): AsyncReadable<GValue> {
    return new AsyncReadable<GValue>(async (signal?: AbortSignal): Promise<AsyncReader<GValue>> => {
      const reader: AsyncReader<GValue> = await this.open(signal);

      return new AsyncReader<GValue>(
        (): Promise<GValue> => {
          return reader.next();
        },
        async (reason: unknown): Promise<void> => {
          try {
            await finallyFnc();
          } finally {
            await reader.close(reason);
          }
        },
      );
    });
  }

  /**
   * TODO doc
   * @experimental
   */
  take(count: number): AsyncReadable<GValue> {
    return new AsyncReadable<GValue>(async (signal?: AbortSignal): Promise<AsyncReader<GValue>> => {
      const reader: AsyncReader<GValue> = await this.open(signal);

      return new AsyncReader<GValue>(
        (): Promise<GValue> => {
          if (count <= 0) {
            throw new CompleteError();
          }
          count--;
          return reader.next();
        },
        (reason: unknown): Promise<void> => {
          return reader.close(reason);
        },
      );
    });
  }

  /**
   * TODO doc
   * @experimental
   */
  takeUntil(value: AsyncReadableSource<any>): AsyncReadable<GValue> {
    return new AsyncReadable<GValue>(async (signal?: AbortSignal): Promise<AsyncReader<GValue>> => {
      interface GMultiAsyncFlowFactoryItems {
        readonly notifier: AsyncReadable<any>;
        readonly reader: AsyncReadable<GValue>;
      }

      type GMultiAsyncFlowItems =
        MultiAsyncFlowFactoryItemsToMultiAsyncFlowItems<GMultiAsyncFlowFactoryItems>;

      const multiAsyncFlow: MultiAsyncFlow<GMultiAsyncFlowItems> =
        await new MultiAsyncFlowFactory<GMultiAsyncFlowFactoryItems>({
          notifier: AsyncReadable.from(value),
          reader: this,
        }).open(signal);

      const { notifier, reader } = multiAsyncFlow.items;

      let notifierPromise: Promise<never>;

      const untilNotifierNext = (): Promise<never> => {
        if (notifierPromise === undefined) {
          notifierPromise = notifier.next().then(
            (): never => {
              throw new CompleteError();
            },
            (error: unknown): never | Promise<never> => {
              if (error instanceof CompleteError) {
                return Promise.withResolvers<never>().promise; // never ending promise
              } else {
                throw new CompleteError();
              }
            },
          );
        }

        return notifierPromise;
      };

      return new AsyncReader<GValue>(
        (): Promise<GValue> => {
          return Promise.race([reader.next(), untilNotifierNext()]);
        },
        (reason: unknown): Promise<void> => {
          return multiAsyncFlow.close(reason);
        },
      );
    });
  }

  /**
   * TODO doc
   * @experimental
   */
  drop(count: number): AsyncReadable<GValue> {
    return new AsyncReadable<GValue>(async (signal?: AbortSignal): Promise<AsyncReader<GValue>> => {
      const reader: AsyncReader<GValue> = await this.open(signal);

      return new AsyncReader<GValue>(
        async (): Promise<GValue> => {
          while (count > 0) {
            await reader.next();
            count--;
          }
          return reader.next();
        },
        (reason: unknown): Promise<void> => {
          return reader.close(reason);
        },
      );
    });
  }

  /**
   * TODO doc
   * @experimental
   */
  share({
    bufferSize = Number.POSITIVE_INFINITY,
    windowTime = Number.POSITIVE_INFINITY,
  }: AsyncReadableShareOptions = {}): AsyncReadable<GValue> {
    bufferSize = Math.max(0, bufferSize);
    windowTime = Math.max(0, windowTime);

    interface CachedValue<GValue> {
      readonly value: GValue;
      readonly expirationDate: number;
    }

    const sharedAsyncReaderFactory: SharedResourceFactory<AsyncReader<GValue>> =
      new SharedResourceFactory<AsyncReader<GValue>>(
        async (signal?: AbortSignal): Promise<SharedResourceLike<AsyncReader<GValue>>> => {
          const reader: AsyncReader<GValue> = await this.open(signal);

          return {
            ref: reader,
            close: (reason?: unknown): Promise<void> => {
              values.length = 0;
              readIndex = 0;
              minReadIndex = 0;
              pendingNext = undefined;
              return reader.close(reason);
            },
          };
        },
      );

    // list of cached values
    const values: CachedValue<GValue>[] = [];
    // index of the "next" read
    let readIndex: number = 0;
    // index of the first cached value relative to `readIndex`
    let minReadIndex: number = 0;
    // a promise based on the most recent `reader.next()`
    let pendingNext: Promise<GValue> | undefined;

    const removeExpiredValues = (): void => {
      const now: number = Date.now();
      while (values.length > 0 && values[0].expirationDate < now) {
        values.shift();
        minReadIndex++;
      }
    };

    return new AsyncReadable<GValue>(async (signal?: AbortSignal): Promise<AsyncReader<GValue>> => {
      const sharedAsyncReader: SharedResource<AsyncReader<GValue>> =
        await sharedAsyncReaderFactory.open(signal);

      let localReadIndex: number = 0;

      return new AsyncReader<GValue>(
        async (signal: AbortSignal): Promise<GValue> => {
          removeExpiredValues();

          localReadIndex = Math.max(localReadIndex, minReadIndex);

          try {
            if (localReadIndex < readIndex) {
              // └> we are behind
              // => we have to return a cached value
              return values[localReadIndex - minReadIndex].value;
            }

            if (pendingNext === undefined) {
              // └> we are ahead
              // => we have to get and cache the next value
              pendingNext = sharedAsyncReader.ref.next().then((value: GValue): GValue => {
                pendingNext = undefined;
                readIndex++;

                if (bufferSize > 0 && windowTime > 0) {
                  // └> if queueing is asked

                  // queue this value
                  values.push({
                    value,
                    expirationDate: Date.now() + windowTime,
                  });

                  // remove the first value if the `values` array's length exceed the max buffer size
                  if (values.length > bufferSize) {
                    values.shift();
                    minReadIndex++;
                  }
                } else {
                  minReadIndex = readIndex;
                }

                return value;
              });
            }

            return await rejectPromiseWhenSignalIsAborted(pendingNext, signal);
          } finally {
            localReadIndex++;
          }
        },
        (reason: unknown): Promise<void> => {
          return sharedAsyncReader.close(reason);
        },
      );
    });
  }

  // Promise based return

  /**
   * Opens this `ReadableStream` and waits until it _completes_.
   * When this happens, it returns the last received value.
   */
  async last(signal?: AbortSignal): Promise<GValue> {
    await using reader: AsyncReader<GValue> = await this.open(signal);

    using stack: DisposableStack = new DisposableStack();

    if (signal !== undefined) {
      stack.use(
        listen(signal, 'abort', (): void => {
          reader.close(signal.reason);
        }),
      );
    }

    while (true) {
      let value: GValue;
      let hasValue: boolean = false;

      try {
        value = await reader.next();
        hasValue = true;
      } catch (error: unknown) {
        if (error instanceof CompleteError) {
          if (hasValue) {
            return value!;
          } else {
            throw new Error('Complete without sending a value.');
          }
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Opens this `ReadableStream` and stores all received values until this stream _completes_.
   * When this happens, it returns all these received values.
   */
  async toArray(signal?: AbortSignal): Promise<GValue[]> {
    await using reader: AsyncReader<GValue> = await this.open(signal);

    using stack: DisposableStack = new DisposableStack();

    if (signal !== undefined) {
      stack.use(
        listen(signal, 'abort', (): void => {
          reader.close(signal.reason);
        }),
      );
    }

    const values: GValue[] = [];

    while (true) {
      try {
        values.push(await reader.next());
      } catch (error: unknown) {
        if (error instanceof CompleteError) {
          return values;
        } else {
          throw error;
        }
      }
    }
  }

  // Cast to other kind of Streams

  toReadableStream(): ReadableStream<GValue> {
    let abortController: AbortController = new AbortController();
    let reader: AsyncReader<GValue>;

    return new ReadableStream({
      start: async (): Promise<void> => {
        reader = await this.open(abortController.signal);
      },
      pull: async (controller: ReadableStreamDefaultController<GValue>): Promise<void> => {
        let value: GValue;

        try {
          value = await reader.next();
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
        await reader.close(reason);
      },
    });
  }

  async *toAsyncGenerator(): AsyncGenerator<GValue, void, void> {
    await using reader: AsyncReader<GValue> = await this.open();

    try {
      yield await reader.next();
    } catch (error: unknown) {
      if (error instanceof CompleteError) {
        return;
      } else {
        throw error;
      }
    }
  }

  [Symbol.asyncIterator](): AsyncGenerator<GValue, void, void> {
    return this.toAsyncGenerator();
  }
}
