import { type FlowError } from '../../../../shared/flow-error.js';

export interface SourceForEachErrorFunction {
  (error: FlowError, signal?: AbortSignal): PromiseLike<void> | void;
}
