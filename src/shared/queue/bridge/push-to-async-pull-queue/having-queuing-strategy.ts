import { type PushToAsyncPullQueueFactory } from './push-to-async-pull-queue-factory.js';

export interface HavingQueuingStrategy<GValue = any> {
  readonly queuingStrategy?: PushToAsyncPullQueueFactory<GValue>;
}
