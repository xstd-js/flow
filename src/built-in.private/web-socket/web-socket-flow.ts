import { WebSocketError } from '@xstd/custom-error';
import { listen } from '@xstd/disposable';
import {
  type SharedResource,
  SharedResourceFactory,
  type SharedResourceLike,
} from '@xstd/shared-resource';
import { Drain } from '../../drain.private/drain.js';
import { flowSyncBridge } from '../../flow/bridge/flow-sync-bridge.js';
import { ReadableFlow } from '../../flow/readable/readable-flow.js';
import { ReadableFlowContext } from '../../flow/readable/types/readable-flow-context.js';

import { ReadableFlowIterator } from '../../flow/readable/types/readable-flow-iterator.js';
import { PushToPullOptions } from '../../shared/push-to-pull-options.js';
import { untilWebSocketClosed } from './functions/until-web-socket-closed.js';
import { untilWebSocketFlushed } from './functions/until-web-socket-flushed.js';
import { untilWebSocketOpened } from './functions/until-web-socket-opened.js';
import { type WebSocketDownValue } from './types/web-socket-down-value.js';
import { type WebSocketUpValue } from './types/web-socket-up-value.js';

export interface WebSocketChannelOptions extends PushToPullOptions {
  readonly protocols?: string | readonly string[];
}

export class WebSocketFlow {
  readonly #url: string | URL;
  readonly #protocols: string | readonly string[] | undefined;
  readonly #bridgeOptions: PushToPullOptions;
  readonly #sharedWebSocketFactory: SharedResourceFactory<WebSocket>;

  readonly #down: ReadableFlow<WebSocketDownValue>;
  readonly #up: Drain<WebSocketUpValue>;

  constructor(url: string | URL, { protocols, ...bridgeOptions }: WebSocketChannelOptions = {}) {
    const self: this = this;

    this.#down = new ReadableFlow<WebSocketDownValue>(async function* (
      ctx: ReadableFlowContext,
    ): ReadableFlowIterator<WebSocketDownValue> {
      const sharedWebSocket: SharedResource<WebSocket> = await self.#sharedWebSocketFactory.open(
        ctx.signal,
      );

      const webSocket: WebSocket = sharedWebSocket.ref;

      const [bridge, reader] = flowSyncBridge<WebSocketDownValue>(ctx.signal, self.#bridgeOptions);

      using _webSocketMessageListener: Disposable = listen(
        webSocket,
        'message',
        (event: MessageEvent): void => {
          bridge.write(event.data);
        },
      );

      using _webSocketErrorListener: Disposable = listen(webSocket, 'error', (): void => {
        bridge.error(new WebSocketError());
      });

      using _webSocketCloseListener: Disposable = listen(
        webSocket,
        'close',
        (event: CloseEvent): void => {
          if (event.wasClean) {
            bridge.complete();
          } else {
            bridge.error(WebSocketError.fromCloseEvent(event));
          }
        },
      );

      yield* reader;
    });

    this.#up = new Drain<WebSocketUpValue>(
      async (flow: ReadableFlow<WebSocketUpValue>, signal: AbortSignal): Promise<void> => {
        await using sharedWebSocket: SharedResource<WebSocket> =
          await this.#sharedWebSocketFactory.open(signal);

        const webSocket: WebSocket = sharedWebSocket.ref;

        for await (const value of flow.open(signal)) {
          webSocket.send(value);
          await untilWebSocketFlushed(webSocket, signal);
        }
      },
    );

    this.#url = url;
    this.#protocols = protocols;
    this.#bridgeOptions = bridgeOptions;

    this.#sharedWebSocketFactory = new SharedResourceFactory<WebSocket>(
      async (signal?: AbortSignal): Promise<SharedResourceLike<WebSocket>> => {
        const webSocket: WebSocket = new WebSocket(this.#url, this.#protocols as string[]);
        webSocket.binaryType = 'arraybuffer';

        try {
          await untilWebSocketOpened(webSocket, signal);
        } catch (error: unknown) {
          await untilWebSocketClosed(webSocket, signal);
          throw error;
        }

        return {
          ref: webSocket,
          close: (reason: unknown): void => {
            if (
              webSocket.readyState === WebSocket.CONNECTING ||
              webSocket.readyState === WebSocket.OPEN
            ) {
              // TODO await buffer flushed ?
              if (reason instanceof WebSocketError) {
                webSocket.close(reason.code, reason.reason);
              } else {
                webSocket.close();
              }
            }
          },
        };
      },
    );
  }

  get down(): ReadableFlow<WebSocketDownValue> {
    return this.#down;
  }

  get up(): Drain<WebSocketUpValue> {
    return this.#up;
  }
}
