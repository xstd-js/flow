import { sleep } from '@xstd/async-task';

export async function untilWebSocketFlushed(
  webSocket: WebSocket,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();

  while (webSocket.bufferedAmount > 0) {
    if (webSocket.readyState === WebSocket.CLOSING || webSocket.readyState === WebSocket.CLOSED) {
      throw new Error(
        `WebSocket ${webSocket.readyState === WebSocket.CLOSING ? 'closing' : 'closed'}.`,
      );
    }
    await sleep(0, signal);
  }
}
