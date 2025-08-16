import {
  type ReadableFlowForkDispose,
  type ReadableFlowForkDisposeHook,
} from './readable-flow-fork-options.js';

export function disposeAfterDuration(duration: number): ReadableFlowForkDisposeHook {
  return (signal: AbortSignal, dispose: ReadableFlowForkDispose): void => {
    signal.addEventListener('abort', (): void => {
      clearTimeout(timer);
    });
    const timer = setTimeout(dispose, duration);
  };
}
