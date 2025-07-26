import { WritableFlow } from '../../../../flow/writable/writable-flow.js';

export interface SourceBridge<GValue> {
  (writable: WritableFlow<GValue>): PromiseLike<void> | void;
}
