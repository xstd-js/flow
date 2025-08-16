import { WebSocketError } from '@xstd/custom-error';
import { listen } from '@xstd/disposable';
import { Drain } from '../../drain/drain.js';
import { flowSyncBridge } from '../../flow/bridge/flow-sync-bridge.js';
import { ReadableFlow } from '../../flow/readable/readable-flow.js';
import { type ReadableFlowForkOptions } from '../../flow/readable/types/methods/fork/readable-flow-fork-options.js';
import { type ReadableFlowContext } from '../../flow/readable/types/readable-flow-context.js';

import { getAsyncEnumeratorNextValue } from '../../enumerable/enumerable.js';
import { type ReadableFlowIterator } from '../../flow/readable/types/readable-flow-iterator.js';
import { type HavingQueuingStrategy } from '../../shared/queue-controller/classic/having-queuing-strategy.js';
import { CountSharedQueue } from '../../shared/queue-controller/shared/built-in/count-shared-queue.js';
import { closeWebSocket } from './functions.private/close-web-socket.js';
import { untilWebSocketClosed } from './functions.private/until-web-socket-closed.js';
import { untilWebSocketFlushed } from './functions.private/until-web-socket-flushed.js';
import { untilWebSocketOpened } from './functions.private/until-web-socket-opened.js';
import { type WebSocketDownValue } from './types/web-socket-down-value.js';
import { type WebSocketUpValue } from './types/web-socket-up-value.js';

export interface WebSocketFlowOptions extends Omit<ReadableFlowForkOptions, 'queuingStrategy'> {
  readonly protocols?: string | readonly string[];
}

export class WebSocketFlow {
  readonly #up: Drain<WebSocketUpValue>;
  readonly #down: ReadableFlow<WebSocketDownValue>;

  constructor(url: string | URL, { protocols, ...forkOptions }: WebSocketFlowOptions = {}) {
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
    }).fork({
      ...forkOptions,
      queuingStrategy: CountSharedQueue.one,
    });

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

    this.#down = new ReadableFlow<WebSocketDownValue, [options?: HavingQueuingStrategy]>(
      async function* (
        { signal }: ReadableFlowContext,
        options?: HavingQueuingStrategy,
      ): ReadableFlowIterator<WebSocketDownValue> {
        signal.throwIfAborted();

        await using stack: AsyncDisposableStack = new AsyncDisposableStack();

        // GET WEBSOCKET

        const webSocket: WebSocket = await getAsyncEnumeratorNextValue(
          stack.use(sharedWebSocketFlow.open(signal)),
        );

        if (webSocket.readyState !== WebSocket.OPEN) {
          throw new Error('WebSocket closed.');
        }

        // BRIDGE

        const [bridge, reader] = flowSyncBridge<WebSocketDownValue>(signal, options);

        // ON MESSAGE
        stack.use(
          listen(webSocket, 'message', (event: MessageEvent): void => {
            bridge.next(event.data);
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
      },
    );
  }

  get up(): Drain<WebSocketUpValue> {
    return this.#up;
  }

  get down(): ReadableFlow<WebSocketDownValue, [options?: HavingQueuingStrategy]> {
    return this.#down;
  }
}
