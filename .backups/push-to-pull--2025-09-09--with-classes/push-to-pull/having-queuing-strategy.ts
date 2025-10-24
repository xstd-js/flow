import { type PushToPullQueueFactory } from './push-to-pull-queue-factory.js';

export interface HavingQueuingStrategy<GValue = any> {
  readonly queuingStrategy?: PushToPullQueueFactory<GValue>;
}
