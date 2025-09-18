import { type PushToSharedAsyncPullQueueFactory } from './push-to-shared-async-pull-queue-factory.js';

export interface HavingSharedQueuingStrategy<GValue = any> {
  readonly queuingStrategy?: PushToSharedAsyncPullQueueFactory<GValue>;
}
