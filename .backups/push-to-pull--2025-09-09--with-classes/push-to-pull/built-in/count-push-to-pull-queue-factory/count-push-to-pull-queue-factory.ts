import { NONE, type None } from '@xstd/none';
import { type IteratorStep } from '../../../../../enumerable/iterator-step.js';
import { type PushToPullQueueFactory } from '../../push-to-pull-queue-factory.js';
import {
  BasicPushToPullQueueFactory,
  type BasicPushToPullQueueFactoryOptions,
} from '../basic-push-to-pull-queue-factory/basic-push-to-pull-queue-factory.js';

export class CountPushToPullQueueFactory<GValue> extends BasicPushToPullQueueFactory<GValue> {
  static #zero: PushToPullQueueFactory<any>;

  static zero<GValue = any>(): PushToPullQueueFactory<GValue> {
    if (this.#zero === undefined) {
      this.#zero = new CountPushToPullQueueFactory<any>(0);
    }
    return this.#zero;
  }

  static #one: PushToPullQueueFactory<any>;

  static one<GValue = any>(): PushToPullQueueFactory<GValue> {
    if (this.#one === undefined) {
      this.#one = new CountPushToPullQueueFactory<any>(1);
    }
    return this.#one;
  }

  static #infinity: PushToPullQueueFactory<any>;

  static infinity<GValue = any>(): PushToPullQueueFactory<GValue> {
    if (this.#infinity === undefined) {
      this.#infinity = new CountPushToPullQueueFactory<any>(Number.POSITIVE_INFINITY);
    }
    return this.#infinity;
  }

  readonly #count: number;

  constructor(count: number) {
    super((): BasicPushToPullQueueFactoryOptions<GValue> => {
      const queue: IteratorStep<GValue>[] = [];

      return {
        push: (value: IteratorStep<GValue>): void => {
          queue.push(value);

          if (queue.length > this.#count) {
            queue.shift();
          }
        },
        pull: (): IteratorStep<GValue> | None => {
          if (queue.length === 0) {
            return NONE;
          } else {
            return queue.shift()!;
          }
        },
      };
    });

    this.#count = Math.max(0, count);
  }
}
