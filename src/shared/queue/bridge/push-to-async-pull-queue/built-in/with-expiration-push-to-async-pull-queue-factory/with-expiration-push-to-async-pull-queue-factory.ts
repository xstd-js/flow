import { NONE, type None } from '@xstd/none';
import { type QueueStep } from '../../../../queue-step.js';
import {
  GenericPushToAsyncPullQueueFactory,
  type GenericPushToAsyncPullQueueFactoryOptions,
} from '../generic-push-to-async-pull-queue-factory/generic-push-to-async-pull-queue-factory.js';

interface Entry<GValue> {
  readonly step: QueueStep<GValue>;
  readonly expirationDate: number;
}

export class WithExpirationPushToAsyncPullQueueFactory<
  GValue,
> extends GenericPushToAsyncPullQueueFactory<GValue> {
  readonly #duration: number;

  constructor(duration: number) {
    if (duration <= 0) {
      throw new Error('Duration must be greater to 0');
    }

    super((): GenericPushToAsyncPullQueueFactoryOptions<GValue> => {
      const queue: Entry<GValue>[] = [];

      return {
        push: (step: QueueStep<GValue>): void => {
          queue.push({
            step,
            expirationDate: Date.now() + this.#duration,
          });
        },
        pull: (): QueueStep<GValue> | None => {
          const now: number = Date.now();
          while (queue.length > 0 && queue[0].expirationDate < now) {
            queue.shift();
          }

          if (queue.length === 0) {
            return NONE;
          } else {
            return queue.shift()!.step;
          }
        },
      };
    });

    this.#duration = duration;
  }
}
