import { type FlowError } from '../../../../shared/flow-error.js';
import { type SourceLike } from '../../source-like.js';

export interface SourceFlatMapErrorFunction<GOut> {
  (error: FlowError): SourceLike<GOut>;
}
