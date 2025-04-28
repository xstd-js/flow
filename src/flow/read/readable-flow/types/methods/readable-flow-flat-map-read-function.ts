import { type ReadableFlowSource } from '../readable-flow-source.js';

export interface ReadableFlowFlatMapReadFunction<GValue, GNewValue> {
  (value: GValue): ReadableFlowSource<GNewValue>;
}
