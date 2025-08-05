import { type EqualFunction } from '@xstd/equal-function';

export interface ReadableFlowDistinctOptions<GValue> {
  readonly equal?: EqualFunction<GValue>;
}
