import { type PullQueue } from '../pull-queue/pull-queue.js';
import { type PushQueue } from '../push-queue/push-queue.js';

export interface PushToPullQueueOptions<GValue> {
  readonly push: PushQueue<GValue>;
  readonly pull: PullQueue<GValue>;
}

export class PushToPullQueue<GValue> {
  readonly #push: PushQueue<GValue>;
  readonly #pull: PullQueue<GValue>;

  constructor({ push, pull }: PushToPullQueueOptions<GValue>) {
    this.#push = push;
    this.#pull = pull;
  }

  get push(): PushQueue<GValue> {
    return this.#push;
  }

  get pull(): PullQueue<GValue> {
    return this.#pull;
  }
}
