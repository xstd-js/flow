import { type PushToPullQueue } from './push-to-pull-queue/push-to-pull-queue.js';

export interface PushToPullQueueFactoryCreateFunction<GValue> {
  (signal: AbortSignal): PushToPullQueue<GValue>;
}

export class PushToPullQueueFactory<GValue> {
  readonly #create: PushToPullQueueFactoryCreateFunction<GValue>;

  constructor(create: PushToPullQueueFactoryCreateFunction<GValue>) {
    this.#create = create;
  }

  get create(): PushToPullQueueFactoryCreateFunction<GValue> {
    return this.#create;
  }
}
