import { type SharedQueue } from './shared-queue.js';

export interface SharedQueuingStrategyFactory {
  <GValue>(): SharedQueue<GValue>;
}
