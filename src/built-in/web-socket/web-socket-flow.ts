import { WebSocketError } from '@xstd/custom-error';
import { listen } from '@xstd/disposable';
import { Drain } from '../../drain/drain.js';
import { flowSyncBridge } from '../../flow/bridge/flow-sync-bridge.js';
import { ReadableFlow } from '../../flow/readable/readable-flow.js';
import { type ReadableFlowContext } from '../../flow/readable/types/readable-flow-context.js';

import { getAsyncEnumeratorNextValue } from '../../enumerable/enumerable.js';
import { type FlowReader } from '../../flow/readable/types/flow-reader.js';
import { type ReadableFlowIterator } from '../../flow/readable/types/readable-flow-iterator.js';
import { type PushToPullOptions } from '../../shared/push-to-pull-options.js';
import { closeWebSocket } from './functions.private/close-web-socket.js';
import { untilWebSocketClosed } from './functions.private/until-web-socket-closed.js';
import { untilWebSocketFlushed } from './functions.private/until-web-socket-flushed.js';
import { untilWebSocketOpened } from './functions.private/until-web-socket-opened.js';
import { type WebSocketDownValue } from './types/web-socket-down-value.js';
import { type WebSocketUpValue } from './types/web-socket-up-value.js';

export interface WebSocketFlowOptions extends PushToPullOptions {
  readonly protocols?: string | readonly string[];
}

export class WebSocketFlow {
  readonly #up: Drain<WebSocketUpValue>;
  readonly #down: ReadableFlow<WebSocketDownValue>;

  constructor(url: string | URL, { protocols, ...bridgeOptions }: WebSocketFlowOptions = {}) {
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

      yield webSocket;
    });

    this.#up = new Drain<WebSocketUpValue>(
      async (flow: ReadableFlow<WebSocketUpValue>, signal: AbortSignal): Promise<void> => {
        signal.throwIfAborted();

        await using webSocketReader: FlowReader<WebSocket> = sharedWebSocketFlow
          .edge()
          .open(signal);

        const webSocket: WebSocket = await getAsyncEnumeratorNextValue(webSocketReader);

        for await (const value of flow.open(signal)) {
          webSocket.send(value);
          await untilWebSocketFlushed(webSocket, { signal });
        }
      },
    );

    this.#down = new ReadableFlow<WebSocketDownValue>(async function* ({
      signal,
    }: ReadableFlowContext): ReadableFlowIterator<WebSocketDownValue> {
      signal.throwIfAborted();

      // GET WEBSOCKET

      await using webSocketReader: FlowReader<WebSocket> = sharedWebSocketFlow.edge().open(signal);

      const webSocket: WebSocket = await getAsyncEnumeratorNextValue(webSocketReader);

      if (webSocket.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket closed.');
      }

      await using stack: AsyncDisposableStack = new AsyncDisposableStack();

      // BRIDGE

      const [bridge, reader] = flowSyncBridge<WebSocketDownValue>(signal, bridgeOptions);

      // ON MESSAGE
      stack.use(
        listen(webSocket, 'message', (event: MessageEvent): void => {
          bridge.write(event.data);
        }),
      );

      // ON ERROR
      stack.use(
        listen(webSocket, 'error', (): void => {
          bridge.error(new WebSocketError());
        }),
      );

      // ON CLOSE
      stack.use(
        listen(webSocket, 'close', (event: CloseEvent): void => {
          if (event.wasClean) {
            bridge.complete();
          } else {
            bridge.error(WebSocketError.fromCloseEvent(event));
          }
        }),
      );

      // DELEGATE TO THE BRIDGE

      yield* reader;
    });
  }

  get up(): Drain<WebSocketUpValue> {
    return this.#up;
  }

  get down(): ReadableFlow<WebSocketDownValue> {
    return this.#down;
  }
}
