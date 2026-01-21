import { type Flow } from '../../../flow.ts';

export interface FlowCatchFunction<GOut> {
  (error: unknown): Flow<GOut, []>;
}
