import { type None } from '@xstd/none';

export interface GenericQueue<GValue> {
  push(value: GValue): void;

  pull(): GValue | None;
}
