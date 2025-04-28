export interface AsyncFlowNextCallback<GArguments extends readonly unknown[], GReturn> {
  (...args: AsyncFlowNextArguments<GArguments>): PromiseLike<GReturn> | GReturn;
}

export type AsyncFlowNextArguments<GArguments extends readonly unknown[]> = readonly [
  ...args: GArguments,
  signal: AbortSignal,
];

export interface AsyncFlowCloseCallback {
  (reason?: unknown): PromiseLike<void> | void;
}

/**
 * Represents an Async Stream.
 */
export class AsyncFlow<GArguments extends readonly unknown[], GReturn> implements AsyncDisposable {
  readonly #next: AsyncFlowNextCallback<GArguments, GReturn>;
  readonly #close: AsyncFlowCloseCallback | undefined;
  readonly #controller: AbortController;
  #queue: Promise<any>;

  constructor(
    next: AsyncFlowNextCallback<GArguments, GReturn>,
    close?: AsyncFlowCloseCallback | undefined,
  ) {
    this.#next = next;
    this.#close = close;
    this.#controller = new AbortController();
    this.#queue = Promise.resolve();
  }

  /**
   * Calls the `next` step of this Flow:
   *  - this function awaits that all previous `next` are fulfilled - then:
   *    - if the Flow is closed, it throws an error,
   *    - else it calls the `next` function given to the constructor
   */
  next(...args: GArguments): Promise<GReturn> {
    return (this.#queue = this.#queue.then(
      (): PromiseLike<GReturn> | GReturn => {
        this.#controller.signal.throwIfAborted();
        return this.#next(...args, this.#controller.signal);
      },
      (): PromiseLike<GReturn> | GReturn => {
        this.#controller.signal.throwIfAborted();
        return this.#next(...args, this.#controller.signal);
      },
    ));
  }

  /**
   * Returns `true` if this Flow is closed.
   */
  get closed(): boolean {
    return this.#controller.signal.aborted;
  }

  /**
   * Throws an error if this Flow is closed.
   */
  throwIfClosed(): void {
    this.#controller.signal.throwIfAborted();
  }

  /**
   * Closes this Flow with an optional `reason`:
   *  - if the Flow is not closed:
   *    - this function awaits that all queued `next` resolve (fulfilled or rejected),
   *    - then, it calls the `close` function given to the constructor
   *    - it returns a Promise resolved when this process is done.
   *  - if the Flow is already closed, this function returns the previously mentioned Promise.
   */
  close(reason?: unknown): Promise<void> {
    if (!this.#controller.signal.aborted) {
      this.#controller.abort(reason);
      this.#queue = this.#queue.then(
        (): PromiseLike<void> | void => {
          return this.#close?.(reason);
        },
        (): PromiseLike<void> | void => {
          return this.#close?.(reason);
        },
      );
    }

    return this.#queue;
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
