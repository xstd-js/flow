import { type Flow } from '../../../flow.js';

export interface FlowFlatMapFunction<GIn, GOut> {
  (value: GIn): Flow<GOut, []>;
}
