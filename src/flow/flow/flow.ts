import { isAsyncGeneratorFunction } from '@xstd/async-generator';
import { listen } from '@xstd/disposable';
import { type AsyncEnumeratorObject, type EnumeratorResult } from '../../enumerable/enumerable.js';

/*---*/

export interface FlowFactory<GIn, GOut, GReturn, GArguments extends readonly unknown[] = []> {
  (ctx: FlowContext<GIn, GReturn>, ...args: GArguments): AsyncGenerator<GOut, GReturn, void>;
}

export interface FlowContext<GIn, GReturn> {
  readonly $next: FlowContextNext<GIn>;
  readonly $return: FlowContextReturn<GReturn>;
  readonly signal: AbortSignal;
}

export interface FlowContextNext<GIn> {
  (): GIn;
}

export interface FlowContextReturn<GReturn> {
  (): GReturn;
}

/*---*/

export class Flow<GIn, GOut, GReturn, GArguments extends readonly unknown[] = []> {
  static debugMode: boolean = true;

  static concat<GIn, GOut, GArguments extends readonly unknown[] = []>(
    ...flows: Flow<GIn, GOut, void, GArguments>[]
  ): Flow<GIn, GOut, void, GArguments> {
    return new Flow<GIn, GOut, void, GArguments>(async function* (
      ctx: FlowContext<GIn, void>,
      ...args: GArguments
    ): AsyncGenerator<GOut, void, void> {
      for (let i: number = 0; i < flows.length; i++) {
        yield* flows[i].use(ctx, ...args);
      }
    });
  }

  readonly #factory: FlowFactory<GIn, GOut, GReturn, GArguments>;

  constructor(factory: FlowFactory<GIn, GOut, GReturn, GArguments>) {
    if (!isAsyncGeneratorFunction(factory)) {
      throw new TypeError('The factory must be an AsyncGenerator function.');
    }

    this.#factory = factory;
  }

  open(signal: AbortSignal, ...args: GArguments): AsyncEnumeratorObject<GIn, GOut, GReturn> {
    let nextValue: GIn;
    let hasNextValue: boolean = false;

    let returnValue: GReturn;
    let hasReturnValue: boolean = false;

    const iterator: AsyncGenerator<GOut, GReturn, void> = this.#factory(
      {
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
      },
      ...args,
    );

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
                'The `AsyncIterator` threw an error while the signal of this flow was aborted. This error is expected to be `signal.reason`. Got:',
              );
              console.error(error);
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
      [Symbol.asyncDispose]: async (): Promise<void> => {
        // return iterator[Symbol.asyncDispose]() as Promise<void>;
        try {
          await enumerator.return(undefined as GReturn);
        } catch (error: unknown) {
          if (!signal.aborted || error !== signal.reason) {
            throw error;
          }
        }
      },
    };

    return enumerator;
  }

  // nest, transfer, adopt, use, expand
  use(
    ctx: FlowContext<GIn, GReturn>,
    ...args: GArguments
  ): AsyncEnumeratorObject<void, GOut, GReturn> {
    return this.#factory(ctx, ...args) as AsyncEnumeratorObject<void, GOut, GReturn>;
  }
}
