import { NoOptions } from '../../../../flow/flow.js';
import { type ReadableFlow } from '../../../readable-flow.js';

export interface FlowFlatMapFunction<GIn, GOut> {
  (value: GIn): ReadableFlow<GOut, NoOptions>;
}
