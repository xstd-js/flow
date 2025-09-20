import { WebSocketError } from '@xstd/custom-error';
import { Drain } from '../../drain/drain.js';
import { ReadableFlow } from '../../flow/readable/readable-flow.js';
import { type ReadableFlowContext } from '../../flow/readable/types/readable-flow-context.js';

import { getAsyncEnumeratorNextValue } from '../../enumerable/enumerable.js';
import { type ReadableFlowIterator } from '../../flow/readable/types/readable-flow-iterator.js';
import { type PushBridge } from '../../flow/readable/types/static-methods/from-push-source/push-bridge.js';
import { type PushToPullOptions } from '../../shared/queue/bridge/push-to-async-pull-queue/push-to-pull-options/push-to-pull-options.js';
import { closeWebSocket } from './functions.private/close-web-socket.js';
import { untilWebSocketClosed } from './functions.private/until-web-socket-closed.js';
import { untilWebSocketFlushed } from './functions.private/until-web-socket-flushed.js';
import { untilWebSocketOpened } from './functions.private/until-web-socket-opened.js';
import { type WebSocketDownValue } from './types/web-socket-down-value.js';
import { type WebSocketUpValue } from './types/web-socket-up-value.js';

export interface WebSocketFlowOptions {
  readonly protocols?: string | readonly string[];
}

export class WebSocketFlow {
  readonly #up: Drain<WebSocketUpValue>;
  readonly #down: ReadableFlow<WebSocketDownValue>;

  constructor(url: string | URL, { protocols }: WebSocketFlowOptions = {}) {
    const sharedWebSocketFlow = new ReadableFlow<WebSocket>(async function* ({
      signal,
    }: ReadableFlowContext): ReadableFlowIterator<WebSocket> {
      signal.throwIfAborted();

      await using stack: AsyncDisposableStack = new AsyncDisposableStack();

      const webSocket: WebSocket = new WebSocket(url, protocols as string[]);
      webSocket.binaryType = 'arraybuffer';

      stack.defer((): Promise<any> => {
        closeWebSocket(webSocket, signal.reason);
        return untilWebSocketClosed(webSocket, { signal });
      });

      await untilWebSocketOpened(webSocket, { signal });

      while (webSocket.readyState === WebSocket.OPEN) {
        yield webSocket;
        signal.throwIfAborted();
      }

      throw new Error('WebSocket closed.');
    }).fork();

    this.#up = new Drain<WebSocketUpValue>(
      async (flow: ReadableFlow<WebSocketUpValue>, signal: AbortSignal): Promise<void> => {
        signal.throwIfAborted();

        await using stack: AsyncDisposableStack = new AsyncDisposableStack();

        const webSocket: WebSocket = await getAsyncEnumeratorNextValue(
          stack.use(sharedWebSocketFlow.open(signal)),
        );

        for await (const value of flow.open(signal)) {
          webSocket.send(value);
          await untilWebSocketFlushed(webSocket, { signal });
        }
      },
    );

    this.#down = sharedWebSocketFlow.flatMap(
      (webSocket: WebSocket): ReadableFlow<WebSocketDownValue, [options?: PushToPullOptions]> => {
        return ReadableFlow.fromPushSource<WebSocketDownValue>(
          ({ next, error, complete, signal }: PushBridge<WebSocketDownValue>): void => {
            webSocket.addEventListener(
              'message',
              (event: MessageEvent): void => {
                next(event.data);
              },
              { signal },
            );

            webSocket.addEventListener(
              'error',
              (): void => {
                error(new WebSocketError());
              },
              { signal },
            );

            webSocket.addEventListener(
              'close',
              (event: CloseEvent): void => {
                if (event.wasClean) {
                  complete();
                } else {
                  error(WebSocketError.fromCloseEvent(event));
                }
              },
              { signal },
            );
          },
        );
      },
    );
  }

  get up(): Drain<WebSocketUpValue> {
    return this.#up;
  }

  get down(): ReadableFlow<WebSocketDownValue, [options?: PushToPullOptions]> {
    return this.#down;
  }
}
