import { CloseActiveResource, ActiveResource } from '../../resource/active-resource/active-resource.js';

export interface WriteFlow<GValue> {
  (value: GValue, signal: AbortSignal): PromiseLike<void> | void;
}

/**
 * @deprecated
 */
export class WritableFlow<GValue> extends ActiveResource {
  readonly #write: WriteFlow<GValue>;
  #queue: Promise<any>;

  constructor(write: WriteFlow<GValue>, close: CloseActiveResource) {
    super(close);
    this.#write = write;
    this.#queue = Promise.resolve();
  }

  #requestClose(reason?: unknown): void {
    setTimeout((): void => {
      if (!this.closed) {
        console.warn(
          'The write operation of the flow rejected, but the close() method was not called. Closing the flow automatically...',
        );
        void this.close(reason);
      }
    }, 100);
  }

  write(value: GValue, signal?: AbortSignal): Promise<void> {
    return (this.#queue = this.#queue.then(async (): Promise<void> => {
      try {
        return await this.async((signal: AbortSignal): PromiseLike<void> | void => {
          return this.#write(value, signal);
        }, signal);
      } catch (error) {
        this.#requestClose(error);
        throw error;
      }
    }));
  }
}
