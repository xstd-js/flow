import { rejectPromiseWhenSignalIsAborted } from '@xstd/async-task';
import { listen, timeout } from '@xstd/disposable';
import { CloseHandle } from '../../handle/handle.js';
import { ReadableFlow } from '../readable/readable-flow.js';
import { WritableFlow } from '../writable/writable-flow.js';
import { PushToPullOptions } from './types/push-to-pull-options.js';

export interface WritableFlowToReadableFlowBridgeOptions extends PushToPullOptions {
  readonly close?: CloseHandle;
}

interface PendingWrite<GValue> {
  readonly value: GValue;
  readonly pending: PromiseWithResolvers<void>;
}

export class WritableFlowToReadableFlowBridge<GValue> {
  readonly #bufferSize: number;
  readonly #windowTime: number;

  readonly #pendingWrites: PendingWrite<GValue>[];
  #pendingRead: PromiseWithResolvers<GValue> | undefined;

  readonly #writable: WritableFlow<GValue>;
  readonly #readable: ReadableFlow<GValue>;

  constructor({
    bufferSize = Number.POSITIVE_INFINITY,
    windowTime = Number.POSITIVE_INFINITY,
    close = (): void => {},
  }: WritableFlowToReadableFlowBridgeOptions = {}) {
    this.#bufferSize = Math.max(0, bufferSize);
    this.#windowTime = Math.max(0, windowTime);
    this.#pendingWrites = [];

    this.#writable = new WritableFlow<GValue>(
      async (value: GValue, signal: AbortSignal): Promise<void> => {
        this.#readable.throwIfClosed();

        if (this.#pendingRead === undefined) {
          // └> the _write_ operation occurs before the _read_ operation

          if (this.#bufferSize > 0 && this.#windowTime > 0) {
            // └> queuing is enabled

            await using stack: AsyncDisposableStack = new AsyncDisposableStack();

            const pendingWrite: PendingWrite<GValue> = {
              value,
              pending: Promise.withResolvers<void>(),
            };

            const reject = (reason: unknown): void => {
              const index: number = this.#pendingWrites.indexOf(pendingWrite);
              if (index === -1) {
                throw new Error('Write not found.');
              }
              this.#pendingWrites.splice(index, 1)[0].pending.reject(reason);
            };

            stack.use(
              listen(signal, 'abort', (): void => {
                reject(signal.reason);
              }),
            );

            // queue this _write_ operation
            this.#pendingWrites.push(pendingWrite);

            // reject the oldest _write_ operation if the buffer's size exceeds its maximum
            if (this.#pendingWrites.length > this.#bufferSize) {
              this.#pendingWrites
                .shift()!
                .pending.reject(new Error('Buffer reached maximum size.'));
            }

            // register a timeout rejecting the _write_ operation based on `windowTime`
            if (this.#windowTime > 0) {
              stack.use(
                timeout((): void => {
                  reject(new Error('Write expired.'));
                }, this.#windowTime),
              );
            }

            // wait for the next _read_ operation
            return await pendingWrite.pending.promise;
          } else {
            // └> queuing is disabled
            throw new Error(
              'Temping to write data while queuing is disabled and no read operation is pending.',
            );
          }
        } else {
          // └> the _write_ operation occurs after the _read_ operation
          // resolve the pending read operation
          this.#pendingRead.resolve(value);
          this.#pendingRead = undefined;
        }
      },
      (reason: unknown): void => {
        if (this.#pendingRead !== undefined) {
          this.#pendingRead.reject(reason);
        }
      },
    );

    this.#readable = new ReadableFlow<GValue>(
      async (signal: AbortSignal): Promise<GValue> => {
        if (this.#pendingWrites.length > 0) {
          // └> we have some pending _write_ operations (the _read_ operation occurs after the _write_ operation(s))

          // consume and return the oldest pending _write_ operation
          const pendingWrite: PendingWrite<GValue> = this.#pendingWrites.shift()!;
          pendingWrite.pending.resolve();
          return pendingWrite.value;
        } else {
          // └> we have don't have pending _write_ operations (the _read_ operation occurs before the _write_ operation)

          this.#writable.throwIfClosed();

          if (this.#pendingRead === undefined) {
            // └> no _read_ operation is currently in progress (enables concurrent reads)
            // create a promise for the reader that resolves on the next write
            this.#pendingRead = Promise.withResolvers<GValue>();
          }

          // wait for the next _write_ operation to resolve this _read_ operation
          return await rejectPromiseWhenSignalIsAborted(this.#pendingRead!.promise, signal);
        }
      },
      (reason: unknown): PromiseLike<void> | void => {
        while (this.#pendingWrites.length > 0) {
          this.#pendingWrites.shift()!.pending.reject(reason);
        }
        return close(reason);
      },
    );
  }

  get writable(): WritableFlow<GValue> {
    return this.#writable;
  }

  get readable(): ReadableFlow<GValue> {
    return this.#readable;
  }
}
