import { NONE, type None } from '@xstd/none';
import { type QueueStep } from '../../../../queue-step.js';
import { type PushToAsyncPullQueueFactory } from '../../push-to-async-pull-queue-factory.js';
import {
  GenericPushToSharedAsyncPullQueueFactory,
  type GenericPushToAsyncPullQueueFactoryOptions,
} from '../generic-push-to-shared-async-pull-queue-factory/generic-push-to-shared-async-pull-queue-factory.js';

/**
 * TODO
 */
export class CountPushToAsyncPullQueueFactory<
  GValue,
> extends GenericPushToSharedAsyncPullQueueFactory<GValue> {
  static #zero: PushToAsyncPullQueueFactory<any>;

  static zero<GValue = any>(): PushToAsyncPullQueueFactory<GValue> {
    if (this.#zero === undefined) {
      this.#zero = new CountPushToAsyncPullQueueFactory<any>(0);
    }
    return this.#zero;
  }

  static #one: PushToAsyncPullQueueFactory<any>;

  static one<GValue = any>(): PushToAsyncPullQueueFactory<GValue> {
    if (this.#one === undefined) {
      this.#one = new CountPushToAsyncPullQueueFactory<any>(1);
    }
    return this.#one;
  }

  static #infinity: PushToAsyncPullQueueFactory<any>;

  static infinity<GValue = any>(): PushToAsyncPullQueueFactory<GValue> {
    if (this.#infinity === undefined) {
      this.#infinity = new CountPushToAsyncPullQueueFactory<any>(Number.POSITIVE_INFINITY);
    }
    return this.#infinity;
  }

  readonly #count: number;

  constructor(count: number) {
    super((): GenericPushToAsyncPullQueueFactoryOptions<GValue> => {
      const queue: QueueStep<GValue>[] = [];

      return {
        push: (step: QueueStep<GValue>): void => {
          queue.push(step);

          if (queue.length > this.#count) {
            queue.shift();
          }
        },
        pull: (): QueueStep<GValue> | None => {
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
