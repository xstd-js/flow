import { abortify } from '@xstd/abortable';
import { type PushToPullOptions } from '../../shared/push-to-pull-options.js';
import { type FlowReader } from '../readable/types/flow-reader.js';

/*------*/

interface WriteEntry<GValue> {
  readonly value: GValue;
  readonly expirationDate: number;
}

type FlowSyncBridgePushState = 'active' | 'errored' | 'complete';
type FlowSyncBridgePullState = 'active' | 'errored' | 'complete';

/*------*/

export interface FlowSyncBridgeOptions extends PushToPullOptions {}

export interface FlowSyncBridge<GValue> {
  write(value: GValue): void;

  error(error?: unknown): void;

  complete(): void;
}

export type FlowSyncBridgeResult<GValue> = readonly [
  bridge: FlowSyncBridge<GValue>,
  reader: FlowReader<GValue>,
];

/*------*/

export function flowSyncBridge<GValue>(
  signal: AbortSignal,
  {
    bufferSize = Number.POSITIVE_INFINITY,
    windowTime = Number.POSITIVE_INFINITY,
  }: FlowSyncBridgeOptions = {},
): FlowSyncBridgeResult<GValue> {
  bufferSize = Math.max(0, bufferSize);
  windowTime = Math.max(0, windowTime);

  const writesBuffer: WriteEntry<GValue>[] = [];
  let pendingRead: PromiseWithResolvers<void> | undefined;

  let pushState: FlowSyncBridgePushState = 'active';
  let pushError: unknown;
  let pullState: FlowSyncBridgePullState = 'active';

  const isActive = (): boolean => {
    return pushState === 'active' && pullState === 'active';
  };

  const throwIfNotActive = (): void => {
    if (!isActive()) {
      throw new Error('The bridge is not active.');
    }
  };

  const removeExpiredWrites = (): void => {
    const now: number = Date.now();
    while (writesBuffer.length > 0 && writesBuffer[0].expirationDate < now) {
      writesBuffer.shift();
    }
  };

  const resolvePendingRead = (): void => {
    if (pendingRead !== undefined) {
      pendingRead.resolve();
      pendingRead = undefined;
    }
  };

  return [
    {
      write: (value: GValue): void => {
        throwIfNotActive();

        if (bufferSize > 0 && windowTime > 0) {
          writesBuffer.push({
            value,
            expirationDate: Date.now() + windowTime,
          });

          if (writesBuffer.length > bufferSize) {
            writesBuffer.shift();
          }
        } else {
          if (pendingRead !== undefined) {
            writesBuffer.length = 0;
            writesBuffer.push({
              value,
              expirationDate: Number.POSITIVE_INFINITY,
            });
          }
        }

        resolvePendingRead();
      },
      error: (error?: unknown): void => {
        throwIfNotActive();

        pushState = 'errored';
        pushError = error;

        resolvePendingRead();
      },
      complete: (): void => {
        throwIfNotActive();

        pushState = 'complete';

        resolvePendingRead();
      },
    },
    (async function* (): AsyncGenerator<GValue, void, void> {
      try {
        while (true) {
          signal.throwIfAborted();

          // remove the expired writes
          removeExpiredWrites();

          if (writesBuffer.length > 0) {
            // └> the _read_ operation occurs **after** the _write_ operation

            // consume and return the oldest _write_ operation
            yield writesBuffer.shift()!.value;
            // @ts-ignore
          } else if (pushState === 'errored') {
            throw pushError;
            // @ts-ignore
          } else if (pushState === 'complete') {
            return;
          } else {
            // └> the _read_ operation occurthis.#writesBuffers **before** the _write_ operation

            console.assert(pendingRead === undefined);

            // create a promise for the reader that resolves on the next write
            // and wait for the next _write_ operation to resolve this _read_ operation
            await abortify((pendingRead = Promise.withResolvers<void>()).promise, { signal });
          }
        }
      } catch (error: unknown) {
        pullState = 'errored';
        throw error;
      } finally {
        if (pullState === 'active') {
          pullState = 'complete';
        }
      }
    })(),
  ];
}
