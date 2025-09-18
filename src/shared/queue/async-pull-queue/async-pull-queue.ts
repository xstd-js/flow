import { type AsyncEnumeratorObject } from '../../../enumerable/enumerable.js';
import { type QueueStep } from '../queue-step.js';

export interface AsyncPullQueueStepFunction<GValue> {
  (): PromiseLike<QueueStep<GValue>> | QueueStep<GValue>;
}

export class AsyncPullQueue<GValue> implements AsyncIterable<GValue, void, void> {
  readonly #step: AsyncPullQueueStepFunction<GValue>;
  #queue: Promise<any>;
  #done: boolean;

  constructor(step: AsyncPullQueueStepFunction<GValue>) {
    this.#step = step;
    this.#queue = Promise.resolve();
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

  step(): Promise<QueueStep<GValue>> {
    return (this.#queue = this.#queue.then(this.#step, this.#step).then(
      (step: QueueStep<GValue>): QueueStep<GValue> => {
        this.throwIfDone();
        if (step.type === 'error' || step.type === 'complete') {
          this.#done = true;
        }
        return step;
      },
      (error: unknown): never => {
        this.#done = true;
        throw error;
      },
    ));
  }

  async *[Symbol.asyncIterator](): AsyncEnumeratorObject<void, GValue, void> {
    while (true) {
      const step: QueueStep<GValue> = await this.step();

      if (step.type === 'next') {
        yield step.value;
      } else if (step.type === 'error') {
        throw step.error;
      } else {
        return;
      }
    }
  }
}
