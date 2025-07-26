import { type WebSocketDownValue } from '../types/web-socket-down-value.js';

export function convertWebSocketReadValueToUint8Array(input: WebSocketDownValue): Uint8Array {
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  } else if (typeof input === 'string') {
    return new TextEncoder().encode(input);
  } else {
    throw new Error('Unsupported type');
  }
}
