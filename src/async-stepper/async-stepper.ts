import { listen } from '@xstd/disposable';
import { isResultOk, type Result, tryAsyncFnc } from '@xstd/enum';
import { type AsyncEnumeratorObject, type EnumeratorResult } from '@xstd/enumerable';
import { NONE } from '@xstd/none';
import { type AsyncStepperContext } from './types/context/async-stepper-context.ts';
import { type AsyncStepperFactory } from './types/factory/async-stepper-factory.ts';

/**
 * An `AsyncStepper` is a wrapper around an `AsyncGenerator` factory.
 *
 * When _opening_ an AsyncStepper, the provided _factory_ is called with a `StepperContext` and returns a new `AsyncGenerator`.
 * The `StepperContext` exposes functions to read the values sent through `iterator.next(value)` and `iterator.return(value)`.
 * Moreover, it receives an `AbortSignal` that must be used to abort a pending iteration of the stepper.
 *
 * @template GIn - The type of the values sent through `iterator.next(value)`.
 * @template GOut - The type of the values yielded by the stepper (returned by `iterator.next()`).
 * @template GReturn - The type of the value returned by the stepper.
 * @template GArguments - The list of arguments to pass to the factory function.
 */
export class AsyncStepper<GIn, GOut, GReturn, GArguments extends readonly unknown[]> {
  // static concat<GIn, GOut>(...steppers: Stepper<GIn, GOut, void>[]): Stepper<GIn, GOut, void> {
  //   return new Stepper<GIn, GOut, void>(async function* (
  //     ctx: StepperContext<GIn, void>,
  //   ): AsyncGenerator<GOut, void, void> {
  //     for (let i: number = 0; i < steppers.length; i++) {
  //       yield* steppers[i].use(ctx);
  //     }
  //   });
  // }

  readonly #factory: AsyncStepperFactory<GIn, GOut, GReturn, GArguments>;

  constructor(factory: AsyncStepperFactory<GIn, GOut, GReturn, GArguments>) {
    this.#factory = factory;
  }

  /**
   * Opens this AsyncStepper: it calls the provided `factory` function with a corresponding `StepperContext`.
   *
   * The provided _signal_ is used to abort the current pending iteration.
   *
   * @param {AbortSignal} signal - The `AbortSignal` that must be used to abort the current pending iteration.
   * @param {...GArguments} args - The arguments to pass to the factory function.
   * @returns {AsyncEnumeratorObject} An `AsyncEnumeratorObject` that will be used to iterate over the stepper.
   */
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
    let queuedIterations: number = 0;

    const enqueue = (
      task: () => Promise<EnumeratorResult<GOut, GReturn>>,
    ): Promise<EnumeratorResult<GOut, GReturn>> => {
      queuedIterations++;
      // NOTE: we use `queuedIterations` to immediately call the task if there's no pending iteration.
      return (queue = (queuedIterations === 1 ? Promise.try(task) : queue.then(task, task)).finally(
        (): void => {
          queuedIterations--;
        },
      ));
    };

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

    /**
     * When iterating:
     *
     * - if the signal aborts while an iteration is pending:
     *   - the iteration must **reject** with the signal's `reason`, or _any error_ if the iteration is "terminal" (`return` or `throw`)
     *   - OR it must **fulfil** with a _**done** result_
     *   - -> any other behavior will report a warning
     *
     * - if the signal aborts while there's no pending iteration:
     *  - if the iterator is done, do nothing (everything is already complete)
     *  - else, we start a 100ms timer, while we expect the user to call one of the iteration methods (`next`, `return` or `throw`), to complete the flow.
     */
    const iterate = (
      task: () => Promise<EnumeratorResult<GOut, GReturn>>,
      isTerminal: boolean,
    ): Promise<EnumeratorResult<GOut, GReturn>> => {
      return enqueue(async (): Promise<EnumeratorResult<GOut, GReturn>> => {
        endSignalAbortEventListener();
        endSignalAbortedButFlowNotDoneTimer();

        const result: Result<EnumeratorResult<GOut, GReturn>> = await tryAsyncFnc(task);

        if (isResultOk(result)) {
          // └> the iteration fulfilled

          const iteratorResult: EnumeratorResult<GOut, GReturn> = result.value;

          if (!iteratorResult.done) {
            // └> the iterator is not done

            if (signal.aborted) {
              // => if the signal is aborted, then the iterator should have rejected

              console.warn(
                'The `AsyncIterator` returned an `IteratorResult` with `{ done: false }` while the `signal` of this flow is aborted. If this signal is aborted, the `AsyncIterator` is expected to either reject with `signal.reason` or resolve with an `IteratorResult` => `{ done: true }`.',
              );
            } else {
              // => if the signal is aborted while the flow is not running, we must ensure that the user ends the flow by calling one of its methods: `next`, `throw` or `return`.

              // we start listening to the signal's abort event.
              signalAbortEventListener = listen(signal, 'abort', (): void => {
                // └> the signal is aborted, but the flow is not ended yet
                endSignalAbortEventListener();
                // we start a timer to warn the user if the flow is not ended in a reasonable amount of time
                startSignalAbortedButFlowNotDoneTimer();
              });
            }
          }

          return iteratorResult;
        } else {
          // └> the iteration rejected

          const error: unknown = result.error;

          if (!isTerminal && signal.aborted && error !== signal.reason) {
            // => if the signal is aborted, then the iterator must reject with the signal's reason, except if it's a "terminal" operation.

            console.warn(
              'The `AsyncIterator` threw an error while the signal of this flow was aborted. This error is expected to be `signal.reason`. Got:',
            );
            console.error(error);
          }

          throw error;
        }
      });
    };

    const enumerator: AsyncEnumeratorObject<GIn, GOut, GReturn> = {
      next: (value: GIn): Promise<EnumeratorResult<GOut, GReturn>> => {
        return iterate(async (): Promise<EnumeratorResult<GOut, GReturn>> => {
          nextValue = value;
          hasNextValue = true;
          try {
            return await iterator.next();
          } finally {
            hasNextValue = false;
          }
        }, false);
      },
      throw: (error?: unknown): Promise<EnumeratorResult<GOut, GReturn>> => {
        return iterate((): Promise<EnumeratorResult<GOut, GReturn>> => {
          return iterator.throw(error);
        }, true);
      },
      return: (value: GReturn): Promise<EnumeratorResult<GOut, GReturn>> => {
        return iterate(async (): Promise<EnumeratorResult<GOut, GReturn>> => {
          returnValue = value;
          hasReturnValue = true;
          try {
            return await iterator.return(value);
          } finally {
            hasReturnValue = false;
          }
        }, true);
      },
      [Symbol.asyncIterator]: (): AsyncEnumeratorObject<GIn, GOut, GReturn> => {
        return enumerator;
      },
      [Symbol.asyncDispose]: async (): Promise<void> => {
        try {
          while (!(await enumerator.return(NONE as GReturn)).done);
        } catch (error: unknown) {
          // └> the `return` rejected

          if (signal === undefined || !signal.aborted || error !== signal.reason) {
            // if it's due to the `signal`, then we skip the error, else we throw it.
            throw error;
          }
        }
      },
    };

    return enumerator;
  }

  /**
   * Opens this AsyncStepper with a predefined `StepperContext`.
   *
   * Use it only when you want to **delegate an iteration** from one AsyncStepper to another.
   *
   * @param {AsyncStepperContext<GIn, GReturn>} ctx - The `StepperContext` delegated to this AsyncStepper.
   * @param {...GArguments} args - The arguments to pass to the factory function.
   * @return {AsyncEnumeratorObject<void, GOut, GReturn>} An `AsyncEnumeratorObject` that will be used to iterate over the stepper.
   *
   * @example
   *
   * `stepperA` uses `stepperB`:
   *
   * ```ts
   * const stepperA = new AsyncStepper<number, void, void, []>(async function* (
   *   ctx: AsyncStepperContext<number, void>,
   * ): AsyncGenerator<void, void, void> {
   *   yield* stepperB.use(ctx);
   * });
   * ```
   */
  use(
    ctx: AsyncStepperContext<GIn, GReturn>,
    ...args: GArguments
  ): AsyncEnumeratorObject<void, GOut, GReturn> {
    return this.#factory(ctx, ...args) as AsyncEnumeratorObject<void, GOut, GReturn>;
  }
}
