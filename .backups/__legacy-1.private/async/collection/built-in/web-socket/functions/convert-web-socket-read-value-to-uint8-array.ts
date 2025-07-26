import { type WebSocketReadValue } from '../types/web-socket-read-value.js';

export function convertWebSocketReadValueToUint8Array(input: WebSocketReadValue): Uint8Array {
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  } else if (typeof input === 'string') {
    return new TextEncoder().encode(input);
  } else {
    throw new Error('Unsupported type');
  }
}
