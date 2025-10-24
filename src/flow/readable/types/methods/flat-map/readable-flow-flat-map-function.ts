import { type ReadableFlow } from '../../../readable-flow.js';

export interface ReadableFlowFlatMapFunction<GIn, GOut> {
  (value: GIn): ReadableFlow<GOut, []>;
}
