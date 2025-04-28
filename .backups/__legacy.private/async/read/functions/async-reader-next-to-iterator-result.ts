import { CompleteError } from '@xstd/custom-error';
import { type AsyncReader } from '../reader/async-reader.js';

/**
 * Calls `reader.next()` and converts the result as an `IteratorResult`.
 */
export async function asyncReaderNextToIteratorResult<GValue>(
  reader: AsyncReader<GValue>,
): Promise<IteratorResult<GValue, void>> {
  try {
    return {
      done: false,
      value: await reader.next(),
    };
  } catch (error: unknown) {
    if (error instanceof CompleteError) {
      return {
        done: true,
        value: undefined,
      };
    } else {
      throw error;
    }
  }
}
