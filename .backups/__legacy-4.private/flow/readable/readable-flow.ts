import { CompleteError } from '@xstd/custom-error';
import {
  ActiveResource,
  CloseActiveResource,
} from '../../resource/active-resource/active-resource.js';

export interface ReadFlow<GValue> {
  (signal: AbortSignal): PromiseLike<GValue> | GValue;
}

export class ReadableFlow<GValue>
  extends ActiveResource
  implements AsyncIterableIterator<GValue, void, void>
{
  readonly #read: ReadFlow<GValue>;
  #queue: Promise<any>;

  constructor(read: ReadFlow<GValue>, close: CloseActiveResource) {
    super(close);
    this.#read = read;
    this.#queue = Promise.resolve();
  }

  #requestClose(reason?: unknown): void {
    if (!this.closed) {
      setTimeout((): void => {
        if (!this.closed) {
          console.warn(
            'The read operation of the flow rejected, but the close() method was not called. Closing the flow automatically...',
          );
          void this.close(reason);
        }
      }, 100);
    }
  }

  read(signal?: AbortSignal): Promise<GValue> {
    return (this.#queue = this.#queue.then(async (): Promise<GValue> => {
      try {
        return await this.async(this.#read, signal);
      } catch (error) {
        this.#requestClose(error);
        throw error;
      }
    }));
  }

  /* ASYNC ITERATOR */

  async next(): Promise<IteratorResult<GValue, void>> {
    try {
      return {
        done: false,
        value: await this.read(),
      };
    } catch (error: unknown) {
      if (error instanceof CompleteError) {
        return {
          done: true,
          value: undefined,
        };
      }
      throw error;
    }
  }

  async return(reason?: unknown): Promise<IteratorResult<GValue, void>> {
    await this.close(reason);
    return {
      done: true,
      value: undefined,
    };
  }

  async throw(error?: unknown): Promise<IteratorResult<GValue, void>> {
    await this.close(error);
    throw error;
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<GValue> {
    return this;
  }
}
