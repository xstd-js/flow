import { type Flow } from '../../../flow.ts';

export interface FlowFlatMapFunction<GIn, GOut> {
  (value: GIn): Flow<GOut, []>;
}
