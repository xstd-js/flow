import { type AsyncPullQueue } from '../../async-pull-queue/async-pull-queue.js';
import { type PushQueue } from '../../push-queue/push-queue.js';

export interface ForkAsyncPullQueue<GValue> {
  (): AsyncPullQueue<GValue>;
}

export interface PushToSharedAsyncPullQueue<GValue> {
  readonly push: PushQueue<GValue>;
  readonly fork: ForkAsyncPullQueue<GValue>;
}
