import { rejectPromiseWhenSignalIsAborted } from '@xstd/async-task';
import { type AsyncFlowCloseCallback } from '../async/flow/flow/async-flow.js';

import { AsyncReader } from '../async/read/reader/async-reader.js';
import { SyncWriter } from '../sync/write/sync-writer.js';
import { type PushToPullOptions } from './push-to-pull-options.js';

export interface SyncWriterToAsyncReaderBridgeSharedOptions extends PushToPullOptions {}

export interface SyncWriterToAsyncReaderBridgeOptions
  extends SyncWriterToAsyncReaderBridgeSharedOptions {
  // readonly init?: InitSyncWriterToAsyncReaderBridge;
  readonly close?: AsyncFlowCloseCallback;
}

// export interface InitSyncWriterToAsyncReaderBridge {
//   (signal: AbortSignal): PromiseLike<void> | void;
// }

interface PendingWrite<GValue> {
  readonly value: GValue;
  readonly expirationDate: number;
}

export class SyncWriterToAsyncReaderBridge<GValue> {
  readonly #bufferSize: number;
  readonly #windowTime: number;

  readonly #pendingWrites: PendingWrite<GValue>[];
  #pendingRead: PromiseWithResolvers<GValue> | undefined;
  #pendingReads: number;

  readonly #writer: SyncWriter<GValue>;
  readonly #reader: AsyncReader<GValue>;

  constructor({
    bufferSize = Number.POSITIVE_INFINITY,
    windowTime = Number.POSITIVE_INFINITY,
    // init,
    close,
  }: SyncWriterToAsyncReaderBridgeOptions = {}) {
    this.#bufferSize = Math.max(0, bufferSize);
    this.#windowTime = Math.max(0, windowTime);
    this.#pendingWrites = [];
    this.#pendingReads = 0;

    this.#writer = new SyncWriter<GValue>(
      (value: GValue): void => {
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
      },
      (reason: unknown): void => {
        this.#pendingWrites.length = 0;
        if (this.#pendingRead !== undefined) {
          this.#pendingRead.reject(reason);
        }
      },
    );

    this.#reader = new AsyncReader<GValue>(async (signal: AbortSignal): Promise<GValue> => {
      // remove expired pending writes
      this.#removeExpiredPendingWrites();

      if (this.#pendingWrites.length > 0) {
        // └> if _write_ data are available (the _read_ happens **after** the _write_)
        // return the oldest data
        return this.#pendingWrites.shift()!.value;
      } else {
        // └> no _write_ data are available (the _read_ happens **before** the _write_)

        this.#writer.throwIfClosed();

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

  get writer(): SyncWriter<GValue> {
    return this.#writer;
  }

  get reader(): AsyncReader<GValue> {
    return this.#reader;
  }
}
