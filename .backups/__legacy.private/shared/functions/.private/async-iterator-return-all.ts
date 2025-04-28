export async function asyncIteratorReturnAll(
  iterator: Pick<AsyncIterator<unknown, unknown, void>, 'return'>,
): Promise<void> {
  if (iterator.return !== undefined) {
    while (!(await iterator.return()).done) {}
  }
}
