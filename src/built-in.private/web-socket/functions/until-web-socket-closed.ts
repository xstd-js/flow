import { type Abortable } from '@xstd/abortable';
import { WebSocketError } from '@xstd/custom-error';

export function untilWebSocketClosed(
  webSocket: WebSocket,
  { signal }: Abortable = {},
): Promise<CloseEvent | undefined> {
  return new Promise<CloseEvent | undefined>(
    (
      resolve: (value?: CloseEvent | undefined) => void,
      reject: (reason: unknown) => void,
    ): void => {
      signal?.throwIfAborted();

      switch (webSocket.readyState) {
        case webSocket.CONNECTING:
        case webSocket.OPEN:
        case webSocket.CLOSING: {
          const end = (): void => {
            webSocket.removeEventListener('error', onError);
            webSocket.removeEventListener('close', onClose);
            signal?.removeEventListener('abort', onAbort);
          };

          const onError = (): void => {
            end();
            reject(new WebSocketError());
          };

          const onClose = (event: CloseEvent): void => {
            end();
            resolve(event);
          };

          const onAbort = (): void => {
            end();
            reject(signal!.reason);
          };

          webSocket.addEventListener('error', onError);
          webSocket.addEventListener('close', onClose);
          signal?.addEventListener('abort', onAbort);

          break;
        }
        case webSocket.CLOSED:
          return resolve();
      }
    },
  );
}
