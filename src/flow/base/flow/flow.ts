import { TerminalError } from '../../../shared/terminal-error.js';

export interface CloseFlow {
  (reason: unknown): PromiseLike<void> | void;
}

export interface QueuedTask<GReturn> {
  (signal: AbortSignal): PromiseLike<GReturn> | GReturn;
}

/**
 * Represents an Async Stream.
 */
export class Flow {
  readonly #close: CloseFlow;
  readonly #controller: AbortController;
  #queue: Promise<any>;

  constructor(close: CloseFlow) {
    this.#close = close;
    this.#controller = new AbortController();
    this.#queue = Promise.resolve();
  }

  /**
   * Queues a "task" into this Flow:
   *  - this function awaits that all previous `queue` are fulfilled - then:
   *    - if the Flow is closed, it throws an error,
   *    - else it calls the provided `queuedTask`, and adds it to an internal queue.
   */
  queue<GReturn>(queuedTask: QueuedTask<GReturn>): Promise<GReturn> {
    return (this.#queue = this.#queue
      .then(
        (): PromiseLike<GReturn> | GReturn => {
          this.#controller.signal.throwIfAborted();
          return queuedTask(this.#controller.signal);
        },
        (): PromiseLike<GReturn> | GReturn => {
          this.#controller.signal.throwIfAborted();
          return queuedTask(this.#controller.signal);
        },
      )
      .catch((error: unknown): never => {
        if (error instanceof TerminalError) {
          this.close(error);
        }
        throw error;
      }));
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
   *    - this function awaits that all queued "tasks" resolve (fulfilled or rejected),
   *    - then, it calls the `close` function given to the constructor
   *    - it returns a Promise resolved when this process is done.
   *  - if the Flow is already closed, this function returns the previously mentioned Promise.
   */
  close(reason?: unknown): Promise<void> {
    if (!this.#controller.signal.aborted) {
      this.#controller.abort(reason);
      this.#queue = this.#queue.then(
        (): PromiseLike<void> | void => {
          return this.#close(reason);
        },
        (): PromiseLike<void> | void => {
          return this.#close(reason);
        },
      );
    }

    return this.#queue;
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
