import { NONE, type None } from '@xstd/none';
import { type SharedQueueFork } from '../shared-queue-fork.js';
import { type SharedQueue } from '../shared-queue.js';
import { type SharedQueuingStrategyFactory } from '../shared-queuing-strategy-factory.js';

export class CountSharedQueue<GValue> implements SharedQueue<GValue> {
  static factory(count: number): SharedQueuingStrategyFactory {
    return <GValue>() => new CountSharedQueue<GValue>(count);
  }

  static #zero: SharedQueuingStrategyFactory;
  static get zero(): SharedQueuingStrategyFactory {
    if (this.#zero === undefined) {
      this.#zero = <GValue>() => new CountSharedQueue<GValue>(0);
    }
    return this.#zero;
  }

  static #one: SharedQueuingStrategyFactory;
  static get one(): SharedQueuingStrategyFactory {
    if (this.#one === undefined) {
      this.#one = <GValue>() => new CountSharedQueue<GValue>(1);
    }
    return this.#one;
  }

  static #every: SharedQueuingStrategyFactory;
  static get every(): SharedQueuingStrategyFactory {
    if (this.#every === undefined) {
      this.#every = <GValue>() => new CountSharedQueue<GValue>(Number.POSITIVE_INFINITY);
    }
    return this.#every;
  }

  readonly #count: number;
  readonly #queue: GValue[];
  #queueStartIndex: number;

  constructor(count: number) {
    this.#count = Math.max(0, count);
    this.#queue = [];
    this.#queueStartIndex = 0;
  }

  push(value: GValue): void {
    this.#queue.push(value);

    if (this.#queue.length > this.#count) {
      this.#queue.shift();
      this.#queueStartIndex++;
    }
  }

  fork(): SharedQueueFork<GValue> {
    // where to start reading from
    let readIndex: number = this.#queueStartIndex;

    return {
      // push: (value: GValue): void => {
      //   if (readIndex !== this.#queueStartIndex + this.#queue.length) {
      //     throw new Error('Cannot push if the queue is not empty.');
      //   }
      //
      //   readIndex++;
      //
      //   this.#queue.push(value);
      //
      //   if (this.#queue.length > this.#count) {
      //     this.#queue.shift();
      //     this.#queueStartIndex++;
      //   }
      // },
      pull: (): GValue | None => {
        // ensure `readIndex` is at least on the first existing element of the queue
        readIndex = Math.max(readIndex, this.#queueStartIndex); // range [this.#queueStartIndex, readIndex <=> this.#queueStartIndex + queue.length]

        // compute the index of the element to read relative to the queue start index
        const queueIndex: number = readIndex - this.#queueStartIndex; // range [0, queue.length]

        readIndex++;

        if (queueIndex >= this.#queue.length) {
          return NONE;
        } else {
          return this.#queue[queueIndex];
        }
      },
    };
  }
}
