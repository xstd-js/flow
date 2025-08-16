import { type SharedQueuingStrategyFactory } from './shared-queuing-strategy-factory.js';

export interface HavingSharedQueuingStrategy {
  readonly queuingStrategy?: SharedQueuingStrategyFactory;
}
