import { type AsyncGeneratorFunction } from '@xstd/async-generator';
import { type ReadableFlow } from '../readable-flow.js';

export type ReadableFlowSource<GValue> =
  | ReadableFlow<GValue, []>
  | AsyncGeneratorFunction<[], GValue, void, void>
  | Iterable<GValue>
  | AsyncIterable<GValue>;
