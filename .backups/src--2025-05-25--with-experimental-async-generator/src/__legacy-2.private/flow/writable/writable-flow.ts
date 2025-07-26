import { CloseHandle } from '../../handle/handle.js';
import { Flow } from '../flow/flow.js';

export interface WriteFlow<GValue> {
  (value: GValue, signal: AbortSignal): PromiseLike<void> | void;
}

export class WritableFlow<GValue> extends Flow {
  readonly #write: WriteFlow<GValue>;

  constructor(write: WriteFlow<GValue>, close: CloseHandle) {
    super(close);
    this.#write = write;
  }

  async write(value: GValue, signal?: AbortSignal): Promise<void> {
    return super.run((signal: AbortSignal): PromiseLike<void> | void => {
      return this.#write(value, signal);
    }, signal);
  }
}
