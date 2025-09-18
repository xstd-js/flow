import { type PushToSharedAsyncPullQueue } from './push-to-shared-async-pull-queue.js';

export interface CreatePushToSharedAsyncPullQueue<GValue> {
  (signal: AbortSignal): PushToSharedAsyncPullQueue<GValue>;
}

export class PushToSharedAsyncPullQueueFactory<GValue> {
  readonly #create: CreatePushToSharedAsyncPullQueue<GValue>;

  constructor(create: CreatePushToSharedAsyncPullQueue<GValue>) {
    this.#create = create;
  }

  get create(): CreatePushToSharedAsyncPullQueue<GValue> {
    return this.#create;
  }
}
