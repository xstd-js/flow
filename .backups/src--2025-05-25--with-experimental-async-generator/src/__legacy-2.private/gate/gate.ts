import { Handle } from '../handle/handle.js';

export interface OpenGate<GHandle extends Handle> {
  (signal?: AbortSignal): PromiseLike<GHandle> | GHandle;
}

export class Gate<GHandle extends Handle> {
  readonly #open: OpenGate<GHandle>;

  constructor(open: OpenGate<GHandle>) {
    this.#open = open;
  }

  async open(signal?: AbortSignal): Promise<GHandle> {
    signal?.throwIfAborted();
    return this.#open(signal);
  }
}
