import { isPromiseLike } from '../../shared/functions/.private/is-promise-like.js';

export interface CloseActiveResource {
  (reason: unknown): PromiseLike<void> | void;
}

export interface ActiveResourceTask<GReturn> {
  (signal: AbortSignal): PromiseLike<GReturn> | GReturn;
}

export class ActiveResource implements AsyncDisposable {
  readonly #close: CloseActiveResource;
  readonly #controller: AbortController;
  readonly #pendingTasks: Set<PromiseLike<any>>;
  #closePromise: Promise<void> | undefined;

  constructor(close: CloseActiveResource) {
    this.#close = close;
    this.#controller = new AbortController();
    this.#pendingTasks = new Set<PromiseLike<any>>();
    new AsyncDisposableStack();
  }

  async async<GReturn>(task: ActiveResourceTask<GReturn>, signal?: AbortSignal): Promise<GReturn> {
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
