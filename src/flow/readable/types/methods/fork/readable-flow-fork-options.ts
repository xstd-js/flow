import { type HavingSharedQueuingStrategy } from '../../../../../shared/queue/bridge/shared/having-shared-queuing-strategy.js';

export interface ReadableFlowForkOptions<GValue = any> extends HavingSharedQueuingStrategy<GValue> {
  readonly disposeHook?: ReadableFlowForkDisposeHook;
}

export interface ReadableFlowForkDisposeHook {
  (signal: AbortSignal, dispose: ReadableFlowForkDispose): void;
}

export interface ReadableFlowForkDispose {
  (): Promise<void>;
}
