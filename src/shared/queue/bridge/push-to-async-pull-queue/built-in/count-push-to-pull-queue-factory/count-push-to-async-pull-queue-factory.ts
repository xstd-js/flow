import { NONE, type None } from '@xstd/none';
import { type QueueStep } from '../../../../queue-step.js';
import { type PushToAsyncPullQueueFactory } from '../../push-to-async-pull-queue-factory.js';
import { EdgePushToAsyncPullQueueFactory } from '../edge-push-to-async-pull-queue-factory/edge-push-to-async-pull-queue-factory.js';
import {
  GenericPushToAsyncPullQueueFactory,
  type GenericPushToAsyncPullQueueFactoryOptions,
} from '../generic-push-to-async-pull-queue-factory/generic-push-to-async-pull-queue-factory.js';

export class CountPushToAsyncPullQueueFactory<
  GValue,
> extends GenericPushToAsyncPullQueueFactory<GValue> {
  static #zero: PushToAsyncPullQueueFactory<any>;

  static zero<GValue = any>(): EdgePushToAsyncPullQueueFactory<GValue> {
    if (this.#zero === undefined) {
      this.#zero = this.count<any>(0) as EdgePushToAsyncPullQueueFactory<any>;
    }
    return this.#zero;
  }

  static #one: CountPushToAsyncPullQueueFactory<any>;

  static one<GValue = any>(): CountPushToAsyncPullQueueFactory<GValue> {
    if (this.#one === undefined) {
      this.#one = this.count<any>(1) as CountPushToAsyncPullQueueFactory<any>;
    }
    return this.#one;
  }

  static #infinity: CountPushToAsyncPullQueueFactory<any>;

  static infinity<GValue = any>(): CountPushToAsyncPullQueueFactory<GValue> {
    if (this.#infinity === undefined) {
      this.#infinity = this.count<any>(
        Number.POSITIVE_INFINITY,
      ) as CountPushToAsyncPullQueueFactory<any>;
    }
    return this.#infinity;
  }

  static count<GValue>(
    count: number,
  ): EdgePushToAsyncPullQueueFactory<GValue> | CountPushToAsyncPullQueueFactory<GValue> {
    if (count === 0) {
      return EdgePushToAsyncPullQueueFactory.edge<GValue>();
    } else {
      return new CountPushToAsyncPullQueueFactory<GValue>(count);
    }
  }

  readonly #count: number;

  protected constructor(count: number) {
    if (count < 1) {
      throw new Error('Count must be greater or equal to 1');
    }

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

    this.#count = count;
  }
}
