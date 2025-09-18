import { type PushToAsyncPullQueue } from './push-to-async-pull-queue.js';

export interface CreatePushToAsyncPullQueue<GValue> {
  (signal: AbortSignal): PushToAsyncPullQueue<GValue>;
}

export class PushToAsyncPullQueueFactory<GValue> {
  readonly #create: CreatePushToAsyncPullQueue<GValue>;

  constructor(create: CreatePushToAsyncPullQueue<GValue>) {
    this.#create = create;
  }

  get create(): CreatePushToAsyncPullQueue<GValue> {
    return this.#create;
  }
}
