export function iteratorReturnAll(
  iterator: Pick<Iterator<unknown, unknown, void>, 'return'>,
): void {
  if (iterator.return !== undefined) {
    while (!iterator.return().done) {}
  }
}
