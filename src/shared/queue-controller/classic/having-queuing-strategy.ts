import { type GenericQueueFactory } from './generic-queue-factory.js';

export interface HavingQueuingStrategy {
  readonly queuingStrategy?: GenericQueueFactory;
}
