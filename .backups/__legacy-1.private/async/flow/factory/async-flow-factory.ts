import { inspectAsyncTaskArguments } from '@xstd/async-task';
import { listen } from '@xstd/disposable';
import {
  type AsyncFlowCloseCallback,
  type AsyncFlowNextArguments,
  type AsyncFlowNextCallback,
} from '../flow/async-flow.js';
import { type GenericAsyncFlow } from '../flow/types/generic-async-flow.js';
import { type InferAsyncFlowArguments } from '../flow/types/infer-async-flow-arguments.js';
import { type InferAsyncFlowReturn } from '../flow/types/infer-async-flow-return.js';
import { type AsyncFlowFactoryInspectOptions } from './types/methods/async-flow-factory-inspect-options.js';

export interface AsyncFlowFactoryOpenCallback<GAsyncFlow extends GenericAsyncFlow> {
  (signal?: AbortSignal): PromiseLike<GAsyncFlow> | GAsyncFlow;
}

/**
 * Used to create many `AsyncFlow`s.
 */
export class AsyncFlowFactory<GAsyncFlow extends GenericAsyncFlow> {
  readonly #open: AsyncFlowFactoryOpenCallback<GAsyncFlow>;

  constructor(open: AsyncFlowFactoryOpenCallback<GAsyncFlow>) {
    this.#open = open;
  }

  /**
   * Opens an `AsyncFlow` internally described by this `AsyncFlowFactory`.
   */
  async open(signal?: AbortSignal): Promise<GAsyncFlow> {
    signal?.throwIfAborted();
    return this.#open(signal);
  }

  // AsyncFlowFactory return

  inspect({
    open,
    emit,
    receive,
    error,
    abort,
  }: AsyncFlowFactoryInspectOptions<GAsyncFlow> = {}): this {
    type GAsyncFlowFactoryConstructor = new (
      open: AsyncFlowFactoryOpenCallback<GAsyncFlow>,
    ) => this;

    return new (this.constructor as GAsyncFlowFactoryConstructor)(
      async (signal?: AbortSignal): Promise<GAsyncFlow> => {
        const flow: GAsyncFlow = await this.open(signal);

        if (open !== undefined) {
          try {
            open();
          } catch (_error: unknown) {
            reportError(_error);
          }
        }

        type GAsyncFlowArguments = InferAsyncFlowArguments<GAsyncFlow>;
        type GAsyncFlowReturn = InferAsyncFlowReturn<GAsyncFlow>;

        type GAsyncFlowConstructor = new (
          next: AsyncFlowNextCallback<GAsyncFlowArguments, GAsyncFlowReturn>,
          close?: AsyncFlowCloseCallback | undefined,
        ) => GAsyncFlow;

        return new (flow.constructor as GAsyncFlowConstructor)(
          async (
            ...args: AsyncFlowNextArguments<GAsyncFlowArguments>
          ): Promise<GAsyncFlowReturn> => {
            if (emit !== undefined) {
              try {
                emit(...(args.slice(0, -1) as GAsyncFlowArguments));
              } catch (_error: unknown) {
                reportError(_error);
              }
            }

            let result: GAsyncFlowReturn;

            try {
              result = await flow.next(...args);
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

            if (receive !== undefined) {
              try {
                receive(result);
              } catch (_error: unknown) {
                reportError(_error);
              }
            }

            return result;
          },
          async (reason: unknown): Promise<void> => {
            if (abort !== undefined) {
              try {
                abort(reason);
              } catch (_error: unknown) {
                reportError(_error);
              }
            }
            return flow.close(reason);
          },
        );
      },
    );
  }

  // Promise based return

  /**
   * Opens an `AsyncFlow`, calls its `next` method with the provided _arguments_, then it closes this `AsyncFlow`, and returns the result of the `next` call.
   */
  async once(
    ..._args: [...args: InferAsyncFlowArguments<GAsyncFlow>, signal?: AbortSignal]
  ): Promise<InferAsyncFlowReturn<GAsyncFlow>> {
    const [args, signal] = inspectAsyncTaskArguments<InferAsyncFlowArguments<GAsyncFlow>>(_args);

    await using flow: GAsyncFlow = await this.open(signal);

    using stack: DisposableStack = new DisposableStack();

    if (signal !== undefined) {
      stack.use(
        listen(signal, 'abort', (): void => {
          flow.close(signal.reason);
        }),
      );
    }

    return await flow.next(...(args as unknown[]));
  }
}
