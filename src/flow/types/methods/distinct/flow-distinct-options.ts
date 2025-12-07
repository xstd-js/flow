import { type EqualFunction } from '@xstd/equal-function';

export interface FlowDistinctOptions<GValue> {
  readonly equal?: EqualFunction<GValue>;
}
