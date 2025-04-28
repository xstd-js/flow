import { CompleteError, WebSocketError } from '@xstd/custom-error';
import {
  type SharedResource,
  SharedResourceFactory,
  type SharedResourceLike,
} from '@xstd/shared-resource';
import { SyncWriteToFlowReaderBridge } from '../../../bridge/sync-write-to-flow-reader-bridge.js';
import { PushToPullOptions } from '../../../bridge/types/push-to-pull-options.js';
import { FlowReader } from '../../../read/flow-reader/flow-reader.js';
import { ReadableFlow } from '../../../read/readable-flow/readable-flow.js';
import { FlowWriter } from '../../../write/flow-writer/flow-writer.js';
import { WritableFlow } from '../../../write/writable-flow/writable-flow.js';
import { FlowFactoryCollection } from '../../flow-collection-factory/flow-factory-collection.js';
import { untilWebSocketClosed } from './functions/until-web-socket-closed.js';
import { untilWebSocketFlushed } from './functions/until-web-socket-flushed.js';
import { untilWebSocketOpened } from './functions/until-web-socket-opened.js';
import { type WebSocketReadValue } from './types/web-socket-read-value.js';
import { type WebSocketWriteValue } from './types/web-socket-write-value.js';

export interface WebSocketChannelOptions extends PushToPullOptions {
  readonly protocols?: string | readonly string[];
}

export interface WebSocketFlowItems {
  readonly readable: ReadableFlow<WebSocketReadValue>;
  readonly writable: WritableFlow<WebSocketWriteValue>;
}

export class WebSocketFlow extends FlowFactoryCollection<WebSocketFlowItems> {
  readonly #url: string | URL;
  readonly #protocols: string | readonly string[] | undefined;
  readonly #bridgeOptions: PushToPullOptions;
  readonly #sharedWebSocketFactory: SharedResourceFactory<WebSocket>;

  constructor(url: string | URL, { protocols, ...bridgeOptions }: WebSocketChannelOptions = {}) {
    super({
      readable: new ReadableFlow<WebSocketReadValue>(
        async (signal?: AbortSignal): Promise<FlowReader<WebSocketReadValue>> => {
          const sharedWebSocket: SharedResource<WebSocket> =
            await this.#sharedWebSocketFactory.open(signal);

          const webSocket: WebSocket = sharedWebSocket.ref;

          const bridge = new SyncWriteToFlowReaderBridge<WebSocketReadValue>({
            ...this.#bridgeOptions,
            close: async (reason: unknown): Promise<void> => {
              webSocket.removeEventListener('message', onMessage);
              webSocket.removeEventListener('error', onError);
              webSocket.removeEventListener('close', onClose);
              await sharedWebSocket.close(reason);
            },
          });

          const onMessage = (event: MessageEvent): void => {
            bridge.write(event.data);
          };

          const onError = (): void => {
            bridge.close(new WebSocketError());
          };

          const onClose = (event: CloseEvent): void => {
            if (event.wasClean) {
              bridge.close(new CompleteError());
            } else {
              bridge.close(WebSocketError.fromCloseEvent(event));
            }
          };

          webSocket.addEventListener('message', onMessage);
          webSocket.addEventListener('error', onError);
          webSocket.addEventListener('close', onClose);

          return bridge.reader;
        },
      ),
      writable: new WritableFlow<WebSocketWriteValue>(
        async (signal?: AbortSignal): Promise<FlowWriter<WebSocketWriteValue>> => {
          const sharedWebSocket: SharedResource<WebSocket> =
            await this.#sharedWebSocketFactory.open(signal);

          const webSocket: WebSocket = sharedWebSocket.ref;

          return new FlowWriter<WebSocketWriteValue>(
            async (value: WebSocketWriteValue, signal: AbortSignal): Promise<void> => {
              webSocket.send(value);
              await untilWebSocketFlushed(webSocket, signal);
            },
            (reason: unknown): Promise<void> => {
              return sharedWebSocket.close(reason);
            },
          );
        },
      ),
    });

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
}
