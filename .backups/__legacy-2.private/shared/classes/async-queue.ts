export interface QueuedTask<GReturn> {
  (): PromiseLike<GReturn> | GReturn;
}

export class AsyncQueue {
  #queue: Promise<any>;

  constructor() {
    this.#queue = Promise.resolve();
  }

  enqueue<GReturn>(queuedTask: QueuedTask<GReturn>): Promise<GReturn> {
    return (this.#queue = this.#queue.then(queuedTask, queuedTask));
  }
}
