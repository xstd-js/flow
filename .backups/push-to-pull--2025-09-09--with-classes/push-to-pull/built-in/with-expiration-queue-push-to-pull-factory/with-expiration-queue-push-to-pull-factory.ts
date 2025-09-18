import { NONE, type None } from '@xstd/none';
import { type IteratorStep } from '../../../../../enumerable/iterator-step.js';
import {
  BasicPushToPullQueueFactory,
  type BasicPushToPullQueueFactoryOptions,
} from '../basic-push-to-pull-queue-factory/basic-push-to-pull-queue-factory.js';

interface Entry<GValue> {
  readonly value: IteratorStep<GValue>;
  readonly expirationDate: number;
}

export class WithExpirationQueuePushToPullFactory<
  GValue,
> extends BasicPushToPullQueueFactory<GValue> {
  readonly #duration: number;

  constructor(duration: number) {
    if (duration <= 0) {
      throw new Error('Duration must be greater to 0');
    }

    super((): BasicPushToPullQueueFactoryOptions<GValue> => {
      const queue: Entry<GValue>[] = [];

      return {
        push: (value: IteratorStep<GValue>): void => {
          queue.push({
            value,
            expirationDate: Date.now() + this.#duration,
          });
        },
        pull: (): IteratorStep<GValue> | None => {
          const now: number = Date.now();
          while (queue.length > 0 && queue[0].expirationDate < now) {
            queue.shift();
          }

          if (queue.length === 0) {
            return NONE;
          } else {
            return queue.shift()!.value;
          }
        },
      };
    });

    this.#duration = duration;
  }
}
