import { NONE, type None } from '@xstd/none';
import { type GenericQueueFactory } from '../generic-queue-factory.js';
import { type GenericQueue } from '../generic-queue.js';

interface Entry<GValue> {
  readonly value: GValue;
  readonly expirationDate: number;
}

export class ExpireQueueController<GValue> implements GenericQueue<GValue> {
  static factory(duration: number): GenericQueueFactory {
    return <GValue>() => new ExpireQueueController<GValue>(duration);
  }

  readonly #duration: number;
  readonly #queue: Entry<GValue>[];

  constructor(duration: number) {
    if (duration <= 0) {
      throw new Error('Duration must be greater to 0');
    }
    this.#duration = duration;
    this.#queue = [];
  }

  #removeExpiredEntries(): void {
    const now: number = Date.now();
    while (this.#queue.length > 0 && this.#queue[0].expirationDate < now) {
      this.#queue.shift();
    }
  }

  push(value: GValue): void {
    this.#queue.push({
      value,
      expirationDate: Date.now() + this.#duration,
    });
  }

  pull(): GValue | None {
    this.#removeExpiredEntries();

    if (this.#queue.length === 0) {
      return NONE;
    } else {
      return this.#queue.shift()!.value;
    }
  }
}
