import { type AsyncGeneratorFunction } from '@xstd/async-generator';
import { type AsyncReadable } from '../../async-readable.js';

export type AsyncReadableSource<GValue> =
  | AsyncReadable<GValue>
  | AsyncGeneratorFunction<[signal: AbortSignal], GValue, void, void>
  | AsyncIterable<GValue, void, void>
  | Iterable<GValue, void, void>;
