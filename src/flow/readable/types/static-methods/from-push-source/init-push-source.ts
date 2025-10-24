import { type PushBridge } from './push-bridge.js';

export interface InitPushSource<GValue> {
  (bridge: PushBridge<GValue>): PromiseLike<void> | void;
}
