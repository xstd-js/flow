import { type SourceLike } from '../../source-like.js';

export interface SourceFlatMapNextFunction<GIn, GOut> {
  (value: GIn): SourceLike<GOut>;
}
