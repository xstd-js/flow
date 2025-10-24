import {
  type AsyncEnumeratorObject,
  type EnumeratorResult,
} from '../../../../enumerable/enumerable.js';

export interface PullQueueNextFunction<GValue> {
  (): Promise<EnumeratorResult<GValue, void>>;
}

export interface PullQueueThrowFunction<GValue> {
  (error?: unknown): Promise<EnumeratorResult<GValue, void>>;
}

export interface PullQueueReturnFunction<GValue> {
  (): Promise<EnumeratorResult<GValue, void>>;
}

export interface PullQueueOptions<GValue> {
  readonly next: PullQueueNextFunction<GValue>;
  readonly throw: PullQueueThrowFunction<GValue>;
  readonly return: PullQueueReturnFunction<GValue>;
}

export class PullQueue<GValue> implements AsyncEnumeratorObject<void, GValue, void> {
  static fromGeneratorFunction<GValue>(iterator: GeneratorFunction<GValue>) {
    if (iterator instanceof Iterator) {
    } else {
      return new PullQueue<GValue>(iterator);
    }
  }

  readonly #next: PullQueueNextFunction<GValue>;
  readonly #throw: PullQueueThrowFunction<GValue>;
  readonly #return: PullQueueReturnFunction<GValue>;

  constructor({ next, throw: _throw, return: _return }: PullQueueOptions<GValue>) {
    this.#next = next;
    this.#throw = _throw;
    this.#return = _return;
  }

  get next(): PullQueueNextFunction<GValue> {
    return this.#next;
  }

  get throw(): PullQueueThrowFunction<GValue> {
    return this.#throw;
  }

  get return(): PullQueueReturnFunction<GValue> {
    return this.#return;
  }

  [Symbol.asyncIterator](): AsyncEnumeratorObject<void, GValue, void> {
    return this;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.#return();
  }
}
