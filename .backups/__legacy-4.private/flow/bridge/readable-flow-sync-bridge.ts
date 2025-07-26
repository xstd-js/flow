import { rejectPromiseWhenSignalIsAborted } from '@xstd/async-task';
import { CompleteError } from '@xstd/custom-error';
import { CloseActiveResource } from '../../resource/active-resource/active-resource.js';
import { ReadableFlow } from '../readable/readable-flow.js';
import { PushToPullOptions } from './types/push-to-pull-options.js';

/*------*/

interface PendingWrite<GValue> {
  readonly value: GValue;
  readonly expirationDate: number;
}

/*------*/

export interface WritableFlowToReadableFlowBridgeOptions extends PushToPullOptions {
  readonly close?: CloseActiveResource;
}

export class ReadableFlowSyncBridge<GValue> {
  readonly #bufferSize: number;
  readonly #windowTime: number;
  readonly #close: CloseActiveResource | undefined;

  readonly #pendingWrites: PendingWrite<GValue>[];
  #pendingRead: PromiseWithResolvers<void> | undefined;

  #writeIsErrored: boolean;
  #writeError: unknown;

  readonly #readable: ReadableFlow<GValue>;

  constructor({
    bufferSize = Number.POSITIVE_INFINITY,
    windowTime = Number.POSITIVE_INFINITY,
    close,
  }: WritableFlowToReadableFlowBridgeOptions = {}) {
    this.#bufferSize = Math.max(0, bufferSize);
    this.#windowTime = Math.max(0, windowTime);
    this.#close = close;
    this.#pendingWrites = [];
    this.#writeIsErrored = false;

    this.#readable = new ReadableFlow<GValue>(
      async (signal: AbortSignal): Promise<GValue> => {
        while (true) {
          // remove the expired pending writes
          this.#removeExpiredPendingWrites();

          if (this.#pendingWrites.length > 0) {
            // └> the _read_ operation occurs **after** the _write_ operation

            // consume and return the oldest pending _write_ operation
            return this.#pendingWrites.shift()!.value;
          } else if (this.#writeIsErrored) {
            throw this.#writeError;
          } else {
            // └> the _read_ operation occurs **before** the _write_ operation

            console.assert(this.#pendingRead === undefined);

            // create a promise for the reader that resolves on the next write
            // and wait for the next _write_ operation to resolve this _read_ operation
            await rejectPromiseWhenSignalIsAborted(
              (this.#pendingRead = Promise.withResolvers<void>()).promise,
              signal,
            );
          }
        }
      },
      (reason: unknown): PromiseLike<void> | void => {
        return this.#close?.(reason);
      },
    );
  }

  #throwIfNotActive(): void {
    if (!this.active) {
      throw new Error('The bridge is not active.');
    }
  }

  #removeExpiredPendingWrites(): void {
    const now: number = Date.now();
    while (this.#pendingWrites.length > 0 && this.#pendingWrites[0].expirationDate < now) {
      this.#pendingWrites.shift();
    }
  }

  #resolvePendingRead(): void {
    if (this.#pendingRead !== undefined) {
      this.#pendingRead.resolve();
      this.#pendingRead = undefined;
    }
  }

  get active(): boolean {
    return !this.#writeIsErrored && !this.#readable.closed;
  }

  get readable(): ReadableFlow<GValue> {
    return this.#readable;
  }

  write(value: GValue): void {
    this.#throwIfNotActive();

    if (this.#bufferSize > 0 && this.#windowTime > 0) {
      this.#pendingWrites.push({
        value,
        expirationDate: Date.now() + this.#windowTime,
      });

      if (this.#pendingWrites.length > this.#bufferSize) {
        this.#pendingWrites.shift();
      }
    } else {
      if (this.#pendingRead !== undefined) {
        this.#pendingWrites.length = 0;
        this.#pendingWrites.push({
          value,
          expirationDate: Number.POSITIVE_INFINITY,
        });
      }
    }

    this.#resolvePendingRead();
  }

  error(error?: unknown): void {
    this.#throwIfNotActive();

    this.#writeIsErrored = true;
    this.#writeError = error;

    this.#resolvePendingRead();
  }

  complete(): void {
    this.error(new CompleteError());
  }
}
