import { NONE, type None } from '@xstd/none';
import { type GenericQueueFactory } from '../generic-queue-factory.js';
import { type GenericQueue } from '../generic-queue.js';

export class CountQueue<GValue> implements GenericQueue<GValue> {
  static factory(count: number): GenericQueueFactory {
    return <GValue>() => new CountQueue<GValue>(count);
  }

  static #zero: GenericQueueFactory;
  static get zero(): GenericQueueFactory {
    if (this.#zero === undefined) {
      this.#zero = <GValue>() => new CountQueue<GValue>(0);
    }
    return this.#zero;
  }

  static #one: GenericQueueFactory;
  static get one(): GenericQueueFactory {
    if (this.#one === undefined) {
      this.#one = <GValue>() => new CountQueue<GValue>(1);
    }
    return this.#one;
  }

  static #every: GenericQueueFactory;
  static get every(): GenericQueueFactory {
    if (this.#every === undefined) {
      this.#every = <GValue>() => new CountQueue<GValue>(Number.POSITIVE_INFINITY);
    }
    return this.#every;
  }

  readonly #count: number;
  readonly #queue: GValue[];

  constructor(count: number) {
    this.#count = Math.max(0, count);
    this.#queue = [];
  }

  push(value: GValue): void {
    this.#queue.push(value);

    if (this.#queue.length > this.#count) {
      this.#queue.shift();
    }
  }

  pull(): GValue | None {
    if (this.#queue.length === 0) {
      return NONE;
    } else {
      return this.#queue.shift()!;
    }
  }
}
