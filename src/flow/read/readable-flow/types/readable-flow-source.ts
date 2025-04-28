import { type AsyncGeneratorFunction } from '@xstd/async-generator';
import { type ReadableFlow } from '../readable-flow.js';

export type ReadableFlowSource<GValue> =
  | ReadableFlow<GValue>
  | AsyncIterable<GValue>
  | AsyncGeneratorFunction<[signal: AbortSignal], GValue, void, void>
  | Iterable<GValue>
  | Promise<GValue>;
