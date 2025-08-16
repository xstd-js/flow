import { type HavingSharedQueuingStrategy } from '../../../../../shared/queue-controller/shared/having-shared-queuing-strategy.js';

export interface ReadableFlowForkOptions extends HavingSharedQueuingStrategy {
  readonly disposeHook?: ReadableFlowForkDisposeHook;
}

export interface ReadableFlowForkDisposeHook {
  (signal: AbortSignal, dispose: ReadableFlowForkDispose): void;
}

export interface ReadableFlowForkDispose {
  (): Promise<void>;
}
