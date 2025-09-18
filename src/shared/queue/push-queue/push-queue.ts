import { type QueueStep } from '../queue-step.js';

export interface PushQueueStepFunction<GValue> {
  (step: QueueStep<GValue>): void;
}

export class PushQueue<GValue> {
  readonly #step: PushQueueStepFunction<GValue>;
  #done: boolean;

  constructor(step: PushQueueStepFunction<GValue>) {
    this.#step = step;
    this.#done = false;
  }

  throwIfDone(): void {
    if (this.#done) {
      throw new Error('PushQueue is done');
    }
  }

  get done(): boolean {
    return this.#done;
  }

  step(step: QueueStep<GValue>): void {
    this.throwIfDone();
    if (step.type === 'error' || step.type === 'complete') {
      this.#done = true;
    }
    return this.#step(step);
  }

  next(value: GValue): void {
    return this.step({
      type: 'next',
      value,
    });
  }

  error(error?: unknown): void {
    return this.step({
      type: 'error',
      error,
    });
  }

  complete(): void {
    return this.step({
      type: 'complete',
    });
  }
}
