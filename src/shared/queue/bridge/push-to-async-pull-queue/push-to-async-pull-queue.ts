import { type AsyncPullQueue } from '../../async-pull-queue/async-pull-queue.js';
import { type PushQueue } from '../../push-queue/push-queue.js';

export interface PushToAsyncPullQueue<GValue> {
  readonly push: PushQueue<GValue>;
  readonly pull: AsyncPullQueue<GValue>;
}
