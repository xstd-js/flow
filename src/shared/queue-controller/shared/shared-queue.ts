import { type SharedQueueFork } from './shared-queue-fork.js';

export interface SharedQueue<GValue> {
  push(value: GValue): void;

  fork(): SharedQueueFork<GValue>;
}
