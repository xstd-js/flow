import { WebSocketError } from '@xstd/custom-error';

export function closeWebSocket(webSocket: WebSocket, reason: unknown): void {
  if (webSocket.readyState === WebSocket.CONNECTING || webSocket.readyState === WebSocket.OPEN) {
    // TODO await buffer flushed ?
    if (reason instanceof WebSocketError) {
      webSocket.close(reason.code, reason.reason);
    } else {
      webSocket.close();
    }
  }
}
