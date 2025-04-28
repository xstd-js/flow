import { type CloseFlow, Flow } from '../../base/flow/flow.js';

export interface WriteFlow<GValue> {
  (value: GValue, signal: AbortSignal): PromiseLike<void> | void;
}

/**
 * Specialization of a `Flow` used to _write_ values.
 */
export class FlowWriter<GValue> extends Flow {
  readonly #write: WriteFlow<GValue>;

  constructor(write: WriteFlow<GValue>, close: CloseFlow) {
    super(close);
    this.#write = write;
  }

  /**
   * Writes a `value` and awaits its completion.
   */
  write(value: GValue): Promise<void> {
    return this.queue((signal: AbortSignal): PromiseLike<void> | void =>
      this.#write(value, signal),
    );
  }
}
