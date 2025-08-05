import { type ReadableFlowSource } from '../../readable-flow-source.js';

export interface FlowFlatMapFunction<GIn, GOut> {
  (value: GIn): ReadableFlowSource<GOut>;
}
