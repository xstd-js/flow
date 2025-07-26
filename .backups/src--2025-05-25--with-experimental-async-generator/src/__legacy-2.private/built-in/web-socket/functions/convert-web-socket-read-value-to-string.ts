import { type WebSocketDownValue } from '../types/web-socket-down-value.js';

export function convertWebSocketReadValueToString(input: WebSocketDownValue): string {
  if (input instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(input));
  } else if (typeof input === 'string') {
    return input;
  } else {
    throw new Error('Unsupported type');
  }
}
