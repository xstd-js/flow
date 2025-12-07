import { type Flow } from '../../../flow.js';

export interface FlowCatchFunction<GOut> {
  (error: unknown): Flow<GOut, []>;
}
