import { type SourceForEachErrorFunction } from './source-for-each-error-function.js';
import { type SourceForEachNextFunction } from './source-for-each-next-function.js';

export interface SourceForEachOptions<GValue> {
  readonly next?: SourceForEachNextFunction<GValue>;
  readonly error?: SourceForEachErrorFunction;
  readonly signal?: AbortSignal;
}
