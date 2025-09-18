import { abortify } from '@xstd/abortable';
import { AsyncPullQueue } from '../../../../async-pull-queue/async-pull-queue.js';
import { PushQueue } from '../../../../push-queue/push-queue.js';
import { type QueueStep } from '../../../../queue-step.js';
import { PushToAsyncPullQueueFactory } from '../../push-to-async-pull-queue-factory.js';
import { type PushToAsyncPullQueue } from '../../push-to-async-pull-queue.js';

export class EdgePushToAsyncPullQueueFactory<GValue> extends PushToAsyncPullQueueFactory<GValue> {
  static #edge: PushToAsyncPullQueueFactory<any>;

  static edge<GValue = any>(): EdgePushToAsyncPullQueueFactory<GValue> {
    if (this.#edge === undefined) {
      this.#edge = new EdgePushToAsyncPullQueueFactory<any>();
    }
    return this.#edge;
  }

  protected constructor() {
    super((signal: AbortSignal): PushToAsyncPullQueue<GValue> => {
      let queueStepPromise: PromiseWithResolvers<QueueStep<GValue>> | undefined;

      return Object.freeze({
        push: new PushQueue<GValue>((step: QueueStep<GValue>): void => {
          signal.throwIfAborted();

          if (queueStepPromise !== undefined) {
            queueStepPromise.resolve(step);
            queueStepPromise = undefined;
          }
        }),
        pull: new AsyncPullQueue<GValue>(async (): Promise<QueueStep<GValue>> => {
          signal.throwIfAborted();

          if (queueStepPromise === undefined) {
            queueStepPromise = Promise.withResolvers<QueueStep<GValue>>();
          }

          return await abortify(queueStepPromise.promise, {
            signal,
          });
        }),
      });
    });
  }
}
