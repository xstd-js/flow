import { type SourceLike } from '../../source-like.js';

export interface SourceFlatMapErrorFunction<GOut> {
  (error: unknown): SourceLike<GOut>;
}
