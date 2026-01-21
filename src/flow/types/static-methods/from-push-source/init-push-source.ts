import { type PushBridge } from './push-bridge.ts';

export interface InitPushSource<GValue> {
  (bridge: PushBridge<GValue>): PromiseLike<void> | void;
}
