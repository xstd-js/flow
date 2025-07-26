import { isPromiseLike } from '../shared/functions/.private/is-promise-like.js';

export interface CloseHandle {
  (reason: unknown): PromiseLike<void> | void;
}

export interface HandleTask<GReturn> {
  (signal: AbortSignal): PromiseLike<GReturn> | GReturn;
}

export class Handle {
  readonly #close: CloseHandle;
  readonly #controller: AbortController;
  readonly #pendingTasks: Set<PromiseLike<any>>;
  #closePromise: Promise<void> | undefined;

  constructor(close: CloseHandle) {
    this.#close = close;
    this.#controller = new AbortController();
    this.#pendingTasks = new Set<PromiseLike<any>>();
  }

  async run<GReturn>(task: HandleTask<GReturn>, signal?: AbortSignal): Promise<GReturn> {
    const sharedSignal: AbortSignal =
      signal === undefined
        ? this.#controller.signal
        : AbortSignal.any([this.#controller.signal, signal]);
    sharedSignal.throwIfAborted();

    const result: PromiseLike<GReturn> | GReturn = task(sharedSignal);

    if (isPromiseLike(result)) {
      if (this.#pendingTasks.has(result)) {
        throw new Error('Task already running');
      }
      this.#pendingTasks.add(result);

      try {
        return await result;
      } finally {
        this.#pendingTasks.delete(result);
      }
    } else {
      return result;
    }
  }

  get closed(): boolean {
    return this.#controller.signal.aborted;
  }

  throwIfClosed(): void {
    this.#controller.signal.throwIfAborted();
  }

  close(reason?: unknown): Promise<void> {
    if (!this.#controller.signal.aborted) {
      this.#controller.abort(reason);
      this.#closePromise = Promise.allSettled(this.#pendingTasks).then(
        (): PromiseLike<void> | void => {
          return this.#close(reason);
        },
      );
    }

    return this.#closePromise!;
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
