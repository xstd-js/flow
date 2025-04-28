import { type CloseFlow, Flow } from '../../base/flow/flow.js';

export interface ReadFlow<GValue> {
  (signal: AbortSignal): PromiseLike<GValue> | GValue;
}

/**
 * Specialization of a `Flow` used to _read_ values.
 */
export class FlowReader<GValue> extends Flow {
  readonly #read: ReadFlow<GValue>;

  constructor(read: ReadFlow<GValue>, close: CloseFlow) {
    super(close);
    this.#read = read;
  }

  /**
   * Reads a `value` and awaits its completion.
   */
  read(): Promise<GValue> {
    return this.queue(this.#read);
  }
}
