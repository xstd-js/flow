import { type GenericQueue } from './generic-queue.js';

export interface GenericQueueFactory {
  <GValue>(): GenericQueue<GValue>;
}
