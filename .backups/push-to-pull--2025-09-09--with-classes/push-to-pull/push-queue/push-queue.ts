export interface PushQueueOptions<GValue> {
  readonly next: PushQueueNextFunction<GValue>;
  readonly error: PushQueueErrorFunction;
  readonly complete: PushQueueCompleteFunction;
}

export interface PushQueueNextFunction<GValue> {
  (value: GValue): void;
}

export interface PushQueueErrorFunction {
  (error?: unknown): void;
}

export interface PushQueueCompleteFunction {
  (): void;
}

export class PushQueue<GValue> {
  readonly #next: PushQueueNextFunction<GValue>;
  readonly #error: PushQueueErrorFunction;
  readonly #complete: PushQueueCompleteFunction;

  constructor({ next, error, complete }: PushQueueOptions<GValue>) {
    this.#next = next;
    this.#error = error;
    this.#complete = complete;
  }

  get next(): PushQueueNextFunction<GValue> {
    return this.#next;
  }

  get error(): PushQueueErrorFunction {
    return this.#error;
  }

  get complete(): PushQueueCompleteFunction {
    return this.#complete;
  }
}
