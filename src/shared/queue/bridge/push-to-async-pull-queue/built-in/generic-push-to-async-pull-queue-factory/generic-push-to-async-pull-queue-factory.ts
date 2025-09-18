import { abortify } from '@xstd/abortable';
import { NONE, type None } from '@xstd/none';
import { AsyncPullQueue } from '../../../../async-pull-queue/async-pull-queue.js';
import { PushQueue } from '../../../../push-queue/push-queue.js';
import { type QueueStep } from '../../../../queue-step.js';
import { PushToAsyncPullQueueFactory } from '../../push-to-async-pull-queue-factory.js';
import { type PushToAsyncPullQueue } from '../../push-to-async-pull-queue.js';

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

export class GenericPushToAsyncPullQueueFactory<
  GValue,
> extends PushToAsyncPullQueueFactory<GValue> {
  constructor(create: GenericPushToAsyncPullQueueFactoryCreateFunction<GValue>) {
    super((signal: AbortSignal): PushToAsyncPullQueue<GValue> => {
      const { push, pull }: GenericPushToAsyncPullQueueFactoryOptions<GValue> = create(signal);

      let queueStepPromise: PromiseWithResolvers<void> | undefined;

      return Object.freeze({
        push: new PushQueue<GValue>((step: QueueStep<GValue>): void => {
          signal.throwIfAborted();

          push(step);

          if (queueStepPromise !== undefined) {
            queueStepPromise.resolve();
            queueStepPromise = undefined;
          }
        }),
        pull: new AsyncPullQueue<GValue>(async (): Promise<QueueStep<GValue>> => {
          signal.throwIfAborted();

          let cachedQueueStep: QueueStep<GValue> | None;
          while ((cachedQueueStep = pull()) === NONE) {
            if (queueStepPromise === undefined) {
              queueStepPromise = Promise.withResolvers<void>();
            }

            await abortify(queueStepPromise.promise, {
              signal,
            });
          }

          return cachedQueueStep;
        }),
      });
    });
  }
}
