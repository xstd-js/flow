import { type AsyncGeneratorFunction } from '@xstd/async-generator';
import { type Source } from '../source.js';

export type SourceLike<GValue> =
  | Source<GValue>
  | AsyncIterable<GValue>
  | AsyncGeneratorFunction<[signal: AbortSignal], GValue, void, void>
  | Iterable<GValue>
  | Promise<GValue>;
