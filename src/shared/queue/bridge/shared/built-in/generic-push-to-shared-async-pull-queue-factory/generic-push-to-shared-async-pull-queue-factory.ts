import { abortify } from '@xstd/abortable';
import { NONE, type None } from '@xstd/none';
import { AsyncPullQueue } from '../../../../async-pull-queue/async-pull-queue.js';
import { PushQueue } from '../../../../push-queue/push-queue.js';
import { type QueueStep } from '../../../../queue-step.js';
import { PushToSharedAsyncPullQueueFactory } from '../../push-to-shared-async-pull-queue-factory.js';
import { PushToSharedAsyncPullQueue } from '../../push-to-shared-async-pull-queue.js';

export interface GenericPushToAsyncPullQueueFactoryCreateFunction<GValue> {
  (signal: AbortSignal): GenericPushToAsyncPullQueueFactoryOptions<GValue>;
}

export interface GenericPushToAsyncPullQueueFactoryOptions<GValue> {
  readonly push: GenericPushToAsyncPullQueueFactoryPushFunction<GValue>;
  readonly pull: GenericPushToAsyncPullQueueFactoryPullFunction<GValue>;
}

export interface GenericPushToAsyncPullQueueFactoryPushFunction<GValue> {
  (step: QueueStep<GValue>): void;
}

export interface GenericPushToAsyncPullQueueFactoryPullFunction<GValue> {
  (): QueueStep<GValue> | None;
}

/**
 * TODO
 */
export class GenericPushToSharedAsyncPullQueueFactory<
  GValue,
> extends PushToSharedAsyncPullQueueFactory<GValue> {
  constructor(create: GenericPushToAsyncPullQueueFactoryCreateFunction<GValue>) {
    super((signal: AbortSignal): PushToSharedAsyncPullQueue<GValue> => {
      // const { push, pull }: GenericPushToAsyncPullQueueFactoryOptions<GValue> = create(signal);

      // TODO
      const count: number = 10;
      const queue: QueueStep<GValue>[] = [];
      let queueStartIndex: number = 0;

      const push = (step: QueueStep<GValue>): void => {
        queue.push(step);

        if (queue.length > count) {
          queue.shift();
          queueStartIndex++;
        }
      };

      const fork = (): GenericPushToAsyncPullQueueFactoryPullFunction<GValue> => {
        // where to start reading from
        let readIndex: number = queueStartIndex;

        return (): QueueStep<GValue> | None => {
          // ensure `readIndex` is at least on the first existing element of the queue
          readIndex = Math.max(readIndex, queueStartIndex); // range [this.#queueStartIndex, readIndex <=> this.#queueStartIndex + queue.length]

          // compute the index of the element to read relative to the queue start index
          const queueIndex: number = readIndex - queueStartIndex; // range [0, queue.length]

          readIndex++;

          if (queueIndex >= queue.length) {
            return NONE;
          } else {
            return queue[queueIndex];
          }
        };
      };

      let queueStepPromise: PromiseWithResolvers<QueueStep<GValue>> | undefined;

      return Object.freeze({
        push: new PushQueue<GValue>((step: QueueStep<GValue>): void => {
          push(step);

          if (queueStepPromise !== undefined) {
            queueStepPromise.resolve(step);
            queueStepPromise = undefined;
          }
        }),
        fork: () => {
          const pull: GenericPushToAsyncPullQueueFactoryPullFunction<GValue> = fork();
          let lastQueueStep: QueueStep<GValue> | undefined;

          return new AsyncPullQueue<GValue>(async (): Promise<QueueStep<GValue>> => {
            signal.throwIfAborted();

            let cachedQueueStep: QueueStep<GValue> | None;
            // dequeue the steps of the queue that have already been treated
            while ((cachedQueueStep = pull()) === lastQueueStep);

            if (cachedQueueStep === NONE) {
              lastQueueStep = await abortify(
                (queueStepPromise = Promise.withResolvers<QueueStep<GValue>>()).promise,
                {
                  signal,
                },
              );
            } else {
              lastQueueStep = cachedQueueStep;
            }

            return lastQueueStep;
          });
        },
      });
    });
  }
}
