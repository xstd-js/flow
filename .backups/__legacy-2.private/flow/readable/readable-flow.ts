import { CloseHandle } from '../../handle/handle.js';
import { Flow } from '../flow/flow.js';

export interface ReadFlow<GValue> {
  (signal: AbortSignal): PromiseLike<GValue> | GValue;
}

export class ReadableFlow<GValue> extends Flow {
  readonly #read: ReadFlow<GValue>;

  constructor(read: ReadFlow<GValue>, close: CloseHandle) {
    super(close);
    this.#read = read;
  }

  async read(signal?: AbortSignal): Promise<GValue> {
    return super.run(this.#read, signal);
  }
}
