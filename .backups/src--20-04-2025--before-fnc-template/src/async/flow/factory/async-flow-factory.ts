import { inspectAsyncTaskArguments } from '@xstd/async-task';
import { listen } from '@xstd/disposable';
import {
  type GenericAsyncFlow,
  type InferAsyncFlowArguments,
  type InferAsyncFlowReturn,
} from '../flow/generic-async-flow.js';

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
