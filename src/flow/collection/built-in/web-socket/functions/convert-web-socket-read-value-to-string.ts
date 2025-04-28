import { type WebSocketReadValue } from '../types/web-socket-read-value.js';

export function convertWebSocketReadValueToString(input: WebSocketReadValue): string {
  if (input instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(input));
  } else if (typeof input === 'string') {
    return input;
  } else {
    throw new Error('Unsupported type');
  }
}
