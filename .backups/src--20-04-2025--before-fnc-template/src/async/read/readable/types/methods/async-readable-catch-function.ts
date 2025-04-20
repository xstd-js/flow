import { type AsyncReadableSource } from '../misc/async-readable-source.js';

export interface AsyncReadableCatchFunction<GValue> {
  (error: unknown): AsyncReadableSource<GValue>;
}
