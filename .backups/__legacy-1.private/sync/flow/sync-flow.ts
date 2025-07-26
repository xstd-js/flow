export interface SyncFlowNextCallback<GArguments extends readonly unknown[], GReturn> {
  (...args: GArguments): GReturn;
}

export interface SyncFluxCloseCallback {
  (reason?: unknown): void;
}

export class SyncFlow<GArguments extends readonly unknown[], GReturn> implements Disposable {
  readonly #next: SyncFlowNextCallback<GArguments, GReturn>;
  readonly #close: SyncFluxCloseCallback | undefined;
  readonly #closed: boolean;
  #closeReason: unknown;

  constructor(
    next: SyncFlowNextCallback<GArguments, GReturn>,
    abort?: SyncFluxCloseCallback | undefined,
  ) {
    this.#next = next;
    this.#close = abort;
    this.#closed = false;
  }

  next(...args: GArguments): GReturn {
    this.throwIfClosed();
    return this.#next(...args);
  }

  get closed(): boolean {
    return this.#closed;
  }

  throwIfClosed(): void {
    if (this.#closed) {
      throw this.#closeReason;
    }
  }

  close(reason: unknown = new Error('Closed without reason.')): void {
    if (!this.#closed) {
      this.#closeReason = reason;
      this.#close?.();
    }
  }

  [Symbol.dispose](): void {
    return this.close();
  }
}
