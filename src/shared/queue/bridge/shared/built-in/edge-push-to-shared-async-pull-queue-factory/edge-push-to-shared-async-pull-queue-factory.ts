import { abortify } from '@xstd/abortable';
import { AsyncPullQueue } from '../../../../async-pull-queue/async-pull-queue.js';
import { PushQueue } from '../../../../push-queue/push-queue.js';
import { type QueueStep } from '../../../../queue-step.js';
import { PushToSharedAsyncPullQueueFactory } from '../../push-to-shared-async-pull-queue-factory.js';
import { type PushToSharedAsyncPullQueue } from '../../push-to-shared-async-pull-queue.js';

export class EdgePushToSharedAsyncPullQueueFactory<
  GValue,
> extends PushToSharedAsyncPullQueueFactory<GValue> {
  static #edge: EdgePushToSharedAsyncPullQueueFactory<any>;

  static edge<GValue = any>(): EdgePushToSharedAsyncPullQueueFactory<GValue> {
    if (this.#edge === undefined) {
      this.#edge = new EdgePushToSharedAsyncPullQueueFactory<any>();
    }
    return this.#edge;
  }

  protected constructor() {
    super((signal: AbortSignal): PushToSharedAsyncPullQueue<GValue> => {
      let queueStepPromise: PromiseWithResolvers<QueueStep<GValue>> | undefined;

      return Object.freeze({
        push: new PushQueue<GValue>((step: QueueStep<GValue>): void => {
          signal.throwIfAborted();

          if (queueStepPromise !== undefined) {
            queueStepPromise.resolve(step);
            queueStepPromise = undefined;
          }
        }),
        fork: (): AsyncPullQueue<GValue> => {
          return new AsyncPullQueue<GValue>(async (): Promise<QueueStep<GValue>> => {
            signal.throwIfAborted();

            if (queueStepPromise === undefined) {
              queueStepPromise = Promise.withResolvers<QueueStep<GValue>>();
            }

            return await abortify(queueStepPromise.promise, {
              signal,
            });
          });
        },
      });
    });
  }
}
