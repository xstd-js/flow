import { type None } from '@xstd/none';

export interface SharedQueueFork<GValue> {
  pull(): GValue | None;
}
