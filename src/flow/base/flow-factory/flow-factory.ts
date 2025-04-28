import { type Flow } from '../flow/flow.js';

export interface OpenFlow<GFlow extends Flow> {
  (signal?: AbortSignal): PromiseLike<GFlow> | GFlow;
}

export class FlowFactory<GFlow extends Flow> {
  readonly #open: OpenFlow<GFlow>;

  constructor(open: OpenFlow<GFlow>) {
    this.#open = open;
  }

  async open(signal?: AbortSignal): Promise<GFlow> {
    signal?.throwIfAborted();
    return this.#open(signal);
  }
}
