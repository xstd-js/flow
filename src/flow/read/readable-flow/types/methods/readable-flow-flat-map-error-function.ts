import { type ReadableFlowSource } from '../readable-flow-source.js';

export interface ReadableFlowFlatMapErrorFunction<GNewValue> {
  (error: unknown): ReadableFlowSource<GNewValue>;
}
