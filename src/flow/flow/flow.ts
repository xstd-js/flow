import { isAsyncGeneratorFunction } from '@xstd/async-generator';
import { listen } from '@xstd/disposable';
import { AsyncEnumeratorObject, EnumeratorResult } from '../../enumerable/enumerable.js';

/*---*/

export type NoOptions = void | {};

/*---*/

export interface FlowFactory<GIn, GOut, GReturn, GOptions> {
  (ctx: FlowFactoryContext<GIn, GReturn, GOptions>): AsyncGenerator<GOut, GReturn, void>;
}

export interface FlowFactoryContext<GIn, GReturn, GOptions> {
  readonly $next: FlowFactoryContextNext<GIn>;
  readonly $return: FlowFactoryContextReturn<GReturn>;
  readonly signal: AbortSignal;
  readonly options: GOptions;
}

export interface FlowFactoryContextNext<GIn> {
  (): GIn;
}

export interface FlowFactoryContextReturn<GReturn> {
  (): GReturn;
}

export type OpenFlowOptions<GOptions> = Omit<
  FlowFactoryContext<any, any, GOptions>,
  '$next' | '$return'
>;

/*---*/

export class Flow<GIn, GOut, GReturn, GOptions> {
  static debugMode: boolean = true;

  static concat<GIn, GOut, GOptions>(
    ...flows: Flow<GIn, GOut, void, GOptions>[]
  ): Flow<GIn, GOut, void, GOptions> {
    return new Flow<GIn, GOut, void, GOptions>(async function* (
      ctx: FlowFactoryContext<GIn, void, GOptions>,
    ): AsyncGenerator<GOut, void, void> {
      for (let i: number = 0; i < flows.length; i++) {
        yield* flows[i].adopt(ctx);
      }
    });
  }

  readonly #factory: FlowFactory<GIn, GOut, GReturn, GOptions>;

  constructor(factory: FlowFactory<GIn, GOut, GReturn, GOptions>) {
    if (!isAsyncGeneratorFunction(factory)) {
      throw new TypeError('The factory must be an AsyncGenerator function.');
    }

    this.#factory = factory;
  }

  open(signal: AbortSignal, options: GOptions): AsyncEnumeratorObject<GIn, GOut, GReturn> {
    let nextValue: GIn;
    let hasNextValue: boolean = false;

    let returnValue: GReturn;
    let hasReturnValue: boolean = false;

    const iterator: AsyncGenerator<GOut, GReturn, void> = this.#factory({
      $next: (): GIn => {
        if (hasNextValue) {
          return nextValue;
        }
        throw new Error('Empty $next().');
      },
      $return: (): GReturn => {
        if (hasReturnValue) {
          return returnValue;
        }
        throw new Error('Empty $return().');
      },
      signal,
      options,
    });

    let queue: Promise<any> = Promise.resolve();

    let signalAbortEventListener: Disposable | undefined;

    const endSignalAbortEventListener = (): void => {
      if (signalAbortEventListener !== undefined) {
        signalAbortEventListener[Symbol.dispose]();
        signalAbortEventListener = undefined;
      }
    };

    let signalAbortedButFlowNotDoneTimer: any;

    const startSignalAbortedButFlowNotDoneTimer = (): void => {
      signalAbortedButFlowNotDoneTimer = setTimeout((): void => {
        console.warn(
          'The signal was aborted while the flow was not running. If this happens, it is expected that one of the following methods of the flow is called to end it: `next`, `throw`, or `return`.',
        );
      }, 100);
    };

    const endSignalAbortedButFlowNotDoneTimer = (): void => {
      if (signalAbortedButFlowNotDoneTimer !== undefined) {
        clearTimeout(signalAbortedButFlowNotDoneTimer);
        signalAbortedButFlowNotDoneTimer = undefined;
      }
    };

    const enqueue = (
      task: () => Promise<EnumeratorResult<GOut, GReturn>>,
    ): Promise<EnumeratorResult<GOut, GReturn>> => {
      const _task = (): Promise<EnumeratorResult<GOut, GReturn>> => {
        endSignalAbortEventListener();
        endSignalAbortedButFlowNotDoneTimer();

        return task();
      };

      return (queue = queue.then(_task, _task).then(
        (result: EnumeratorResult<GOut, GReturn>): EnumeratorResult<GOut, GReturn> => {
          if (!result.done) {
            // └> the iterator is not done

            if (signal.aborted) {
              // => if the signal is aborted, then the iterator should have rejected

              if (Flow.debugMode) {
                console.warn(
                  'The `AsyncIterator` returned an `IteratorResult` with `{ done: false }` while the `signal` of this flow is aborted. If this signal is aborted, the `AsyncIterator` is expected to either reject with `signal.reason` or resolve with an `IteratorResult` => `{ done: true }`.',
                );
              }
            } else {
              // if the signal is aborted while the flow is not running, we must ensure that the user ends the flow by calling one of its methods: `next`, `throw` or `return`.

              // we start listening to the signal's abort event.
              signalAbortEventListener = listen(signal, 'abort', (): void => {
                // └> the signal is aborted, but the flow is not ended yet
                endSignalAbortEventListener();
                // we start a timer to warn the user if the flow is not ended in a reasonable amount of time
                startSignalAbortedButFlowNotDoneTimer();
              });
            }
          }

          return result;
        },
        (error: unknown): never => {
          if (signal.aborted && error !== signal.reason) {
            // => if the signal is aborted, then the iterator must reject with the signal's reason.

            if (Flow.debugMode) {
              console.warn(
                'The `AsyncIterator` threw an error while the signal of this flow was aborted. This error is expected to be `signal.reason`.',
              );
            }
          }

          throw error;
        },
      ));
    };

    const enumerator: AsyncEnumeratorObject<GIn, GOut, GReturn> = {
      next: (value: GIn): Promise<EnumeratorResult<GOut, GReturn>> => {
        return enqueue(async (): Promise<EnumeratorResult<GOut, GReturn>> => {
          nextValue = value;
          hasNextValue = true;
          try {
            return await iterator.next();
          } finally {
            hasNextValue = false;
          }
        });
      },
      throw: (error?: unknown): Promise<EnumeratorResult<GOut, GReturn>> => {
        return enqueue((): Promise<EnumeratorResult<GOut, GReturn>> => {
          return iterator.throw(error);
        });
      },
      return: (value: GReturn): Promise<EnumeratorResult<GOut, GReturn>> => {
        return enqueue(async (): Promise<EnumeratorResult<GOut, GReturn>> => {
          returnValue = value;
          hasReturnValue = true;
          try {
            return await iterator.return(value);
          } finally {
            hasReturnValue = false;
          }
        });
      },
      [Symbol.asyncIterator]: (): AsyncEnumeratorObject<GIn, GOut, GReturn> => {
        return enumerator;
      },
      [Symbol.asyncDispose]: (): Promise<void> => {
        return iterator[Symbol.asyncDispose]() as Promise<void>;
      },
    };

    return enumerator;
  }

  // nest, transfer, adopt
  adopt(
    ctx: FlowFactoryContext<GIn, GReturn, GOptions>,
  ): AsyncEnumeratorObject<void, GOut, GReturn> {
    return this.#factory(ctx) as AsyncEnumeratorObject<void, GOut, GReturn>;
  }
}
