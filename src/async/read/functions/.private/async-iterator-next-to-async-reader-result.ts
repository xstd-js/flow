import { CompleteError } from '@xstd/custom-error';

export async function asyncIteratorNextToAsyncReaderResult<GValue>(
  iterator: Pick<AsyncIterator<GValue, void, void>, 'next'>,
): Promise<GValue> {
  const { done, value } = await iterator.next();
  if (done) {
    throw new CompleteError();
  }
  return value;
}
