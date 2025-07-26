import { WebSocketError } from '@xstd/custom-error';
import {
  type SharedResource,
  SharedResourceFactory,
  type SharedResourceLike,
} from '@xstd/shared-resource';
import { PushToPullOptions } from '../../flow/bridge/types/push-to-pull-options.js';
import { WritableFlowToReadableFlowBridge } from '../../flow/bridge/writable-flow-to-readable-flow-bridge.js';
import { ReadableFlow } from '../../flow/readable/readable-flow.js';
import { Sink } from '../../sink/sink.js';
import { Source } from '../../source/source.js';
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

  readonly #down: Source<WebSocketDownValue>;
  readonly #up: Sink<WebSocketUpValue>;

  constructor(url: string | URL, { protocols, ...bridgeOptions }: WebSocketChannelOptions = {}) {
    this.#down = new Source<WebSocketDownValue>(
      async (signal?: AbortSignal): Promise<ReadableFlow<WebSocketDownValue>> => {
        const sharedWebSocket: SharedResource<WebSocket> =
          await this.#sharedWebSocketFactory.open(signal);

        const webSocket: WebSocket = sharedWebSocket.ref;

        const bridge = new WritableFlowToReadableFlowBridge<WebSocketDownValue>({
          ...this.#bridgeOptions,
          close: async (reason: unknown): Promise<void> => {
            webSocket.removeEventListener('message', onMessage);
            webSocket.removeEventListener('error', onError);
            webSocket.removeEventListener('close', onClose);
            await sharedWebSocket.close(reason);
          },
        });

        const onMessage = (event: MessageEvent): void => {
          bridge.writable.write(event.data).catch((): void => {}); // silent error
        };

        const onError = (): void => {
          bridge.writable.close(new WebSocketError());
        };

        const onClose = (event: CloseEvent): void => {
          if (event.wasClean) {
            bridge.writable.close();
          } else {
            bridge.writable.close(WebSocketError.fromCloseEvent(event));
          }
        };

        webSocket.addEventListener('message', onMessage);
        webSocket.addEventListener('error', onError);
        webSocket.addEventListener('close', onClose);

        return bridge.readable;
      },
    );

    this.#up = new Sink<WebSocketUpValue>(
      async (source: Source<WebSocketUpValue>, signal?: AbortSignal): Promise<void> => {
        const sharedWebSocket: SharedResource<WebSocket> =
          await this.#sharedWebSocketFactory.open(signal);

        const webSocket: WebSocket = sharedWebSocket.ref;

        return source
          .forEach({
            next: async (value: WebSocketUpValue): Promise<void> => {
              webSocket.send(value);
              await untilWebSocketFlushed(webSocket, signal);
            },
            signal,
          })
          .then(
            (): Promise<void> => {
              return sharedWebSocket.close();
            },
            async (reason: unknown): Promise<void> => {
              try {
                await sharedWebSocket.close(reason);
              } catch (error: unknown) {
                throw new SuppressedError(error, reason);
              }
              throw reason;
            },
          );
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

  get down(): Source<WebSocketDownValue> {
    return this.#down;
  }

  get up(): Sink<WebSocketUpValue> {
    return this.#up;
  }
}
