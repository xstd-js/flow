import { rejectPromiseWhenSignalIsAborted } from '@xstd/async-task';
import { CloseFlow } from '../base/flow/flow.js';
import { FlowReader } from '../read/flow-reader/flow-reader.js';
import { PushToPullOptions } from './types/push-to-pull-options.js';

export interface SyncWriteToFlowReaderBridgeOptions extends PushToPullOptions {
  // readonly init?: InitReadableFlowBridge;
  readonly close?: CloseFlow;
}

// export interface InitReadableFlowBridge {
//   (signal: AbortSignal): PromiseLike<void> | void;
// }

interface PendingWrite<GValue> {
  readonly value: GValue;
  readonly expirationDate: number;
}

export class SyncWriteToFlowReaderBridge<GValue> {
  readonly #bufferSize: number;
  readonly #windowTime: number;

  readonly #pendingWrites: PendingWrite<GValue>[];
  #pendingRead: PromiseWithResolvers<GValue> | undefined;
  #pendingReads: number;

  readonly #closed: boolean;
  #closeReason: unknown;

  readonly #reader: FlowReader<GValue>;

  constructor({
    bufferSize = Number.POSITIVE_INFINITY,
    windowTime = Number.POSITIVE_INFINITY,
    // init,
    close = (): void => {},
  }: SyncWriteToFlowReaderBridgeOptions = {}) {
    this.#bufferSize = Math.max(0, bufferSize);
    this.#windowTime = Math.max(0, windowTime);
    this.#pendingWrites = [];
    this.#pendingReads = 0;

    this.#closed = false;

    this.#reader = new FlowReader<GValue>(async (signal: AbortSignal): Promise<GValue> => {
      // remove expired pending writes
      this.#removeExpiredPendingWrites();

      if (this.#pendingWrites.length > 0) {
        // └> if _write_ data are available (the _read_ happens **after** the _write_)
        // return the oldest data
        return this.#pendingWrites.shift()!.value;
      } else {
        // └> no _write_ data are available (the _read_ happens **before** the _write_)

        this.throwIfClosed();

        this.#pendingReads++;

        if (this.#pendingReads === 1) {
          // └> no _read_ is currently performed (-> support concurrent reads)
          // create a promise for the reader, resolved on the next _write_
          this.#pendingRead = Promise.withResolvers<GValue>();
        }

        try {
          // await the next _write_
          return await rejectPromiseWhenSignalIsAborted<GValue>(this.#pendingRead!.promise, signal);
        } finally {
          // └> when the _read_ is done
          this.#pendingReads--;

          if (this.#pendingReads === 0) {
            this.#pendingRead = undefined;
          }
        }
      }
    }, close);
  }

  #removeExpiredPendingWrites(): void {
    const now: number = Date.now();
    while (this.#pendingWrites.length > 0 && this.#pendingWrites[0].expirationDate < now) {
      this.#pendingWrites.shift();
    }
  }

  get reader(): FlowReader<GValue> {
    return this.#reader;
  }

  write(value: GValue): void {
    this.throwIfClosed();
    this.#reader.throwIfClosed();

    if (this.#pendingRead === undefined) {
      // └> if the _write_ happens **before** the _read_
      if (this.#bufferSize > 0 && this.#windowTime > 0) {
        // └> if queueing is asked
        // => register the _write_ in the queue

        // remove expired pending writes
        this.#removeExpiredPendingWrites();

        // queue this write
        this.#pendingWrites.push({
          value,
          expirationDate: Date.now() + this.#windowTime,
        });

        // remove data if they excess the max buffer size
        if (this.#pendingWrites.length > this.#bufferSize) {
          this.#pendingWrites.shift();
        }
      }
    } else {
      // └> if the _write_ happens **after** the _read_
      // resolve the pending read
      this.#pendingRead.resolve(value);
    }
  }

  get closed(): boolean {
    return this.#closed;
  }

  throwIfClosed(): void {
    if (this.#closed) {
      throw this.#closeReason;
    }
  }

  close(reason: unknown = new Error('Closed without reason.')): void {
    if (!this.#closed) {
      this.#closeReason = reason;
      this.#pendingWrites.length = 0;
      if (this.#pendingRead !== undefined) {
        this.#pendingRead.reject(reason);
      }
    }
  }

  [Symbol.dispose](): void {
    return this.close();
  }
}
