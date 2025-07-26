import { type AsyncGeneratorFunction } from '@xstd/async-generator';
import { type AsyncWritable } from '../../async-writable.js';

export type AsyncWritableSource<GValue> =
  | AsyncWritable<GValue>
  | AsyncGeneratorFunction<[signal: AbortSignal], void, void, GValue>
  | AsyncIterable<void, void, GValue>
  | Iterable<void, void, GValue>;
