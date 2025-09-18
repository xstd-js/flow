import { abortify } from '@xstd/abortable';
import { NONE, type None } from '@xstd/none';
import { type IteratorStep } from '../../../../../enumerable/iterator-step.js';
import { PullQueue } from '../../pull-queue/pull-queue.js';
import { PushQueue } from '../../push-queue/push-queue.js';
import { PushToPullQueueFactory } from '../../push-to-pull-queue-factory.js';
import { PushToPullQueue } from '../../push-to-pull-queue/push-to-pull-queue.js';

export interface BasicPushToPullQueueFactoryCreate<GValue> {
  (signal: AbortSignal): BasicPushToPullQueueFactoryOptions<GValue>;
}

export interface BasicPushToPullQueueFactoryOptions<GValue> {
  readonly push: BasicPushToPullQueueFactoryPushFunction<GValue>;
  readonly pull: BasicPushToPullQueueFactoryPullFunction<GValue>;
}

export interface BasicPushToPullQueueFactoryPushFunction<GValue> {
  (value: IteratorStep<GValue>): void;
}

export interface BasicPushToPullQueueFactoryPullFunction<GValue> {
  (): IteratorStep<GValue> | None;
}

export class BasicPushToPullQueueFactory<GValue> extends PushToPullQueueFactory<GValue> {
  constructor(create: BasicPushToPullQueueFactoryCreate<GValue>) {
    super((signal: AbortSignal): PushToPullQueue<GValue> => {
      const { push, pull }: BasicPushToPullQueueFactoryOptions<GValue> = create(signal);

      let iteratorStepPromise: PromiseWithResolvers<IteratorStep<GValue>> | undefined;
      let done: boolean = false;

      const step = (step: IteratorStep<GValue>): void => {
        if (done) {
          throw new Error('Queue closed.');
        }

        push(step);

        if (iteratorStepPromise !== undefined) {
          iteratorStepPromise.resolve(step);
          iteratorStepPromise = undefined;
        }
      };

      return new PushToPullQueue<GValue>({
        push: new PushQueue<GValue>({
          next: (value: GValue): void => {
            step({
              type: 'next',
              value,
            });
          },
          error: (error?: unknown): void => {
            step({
              type: 'error',
              error,
            });
          },
          complete: (): void => {
            step({
              type: 'complete',
            });
          },
        }),
        pull: new PullQueue<GValue>(
          (async function* (): AsyncGenerator<GValue, void, void> {
            try {
              let iteratorStep: IteratorStep<GValue> | undefined;

              while (true) {
                signal.throwIfAborted();

                let cachedIteratorStep: IteratorStep<GValue> | None;
                // dequeue the steps of the queue that have already been treated
                while ((cachedIteratorStep = pull()) === iteratorStep);

                if (cachedIteratorStep === NONE) {
                  iteratorStep = await abortify(
                    (iteratorStepPromise = Promise.withResolvers<IteratorStep<GValue>>()).promise,
                    {
                      signal,
                    },
                  );
                } else {
                  iteratorStep = cachedIteratorStep;
                }

                if (iteratorStep.type === 'next') {
                  yield iteratorStep.value;
                } else if (iteratorStep.type === 'error') {
                  throw iteratorStep.error;
                } else {
                  return;
                }
              }
            } finally {
              done = true;
            }
          })(),
        ),
      });
    });
  }
}
