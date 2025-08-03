// ARGUMENTS

export type EnumeratorNextArguments<GIn> = (GIn extends void | undefined ? [] : never) | [GIn];

export type EnumeratorReturnArguments<GReturn> =
  | (GReturn extends void | undefined ? [] : never)
  | [GReturn];

// RETURN

export interface EnumeratorYieldResult<GOut> {
  done?: false;
  value: GOut;
}

export interface EnumeratorReturnResult<GReturn> {
  done: true;
  value: GReturn;
}

export type EnumeratorResult<GOut, GReturn> =
  | EnumeratorYieldResult<GOut>
  | EnumeratorReturnResult<GReturn>;

// SYNC

export interface Enumerator<GIn, GOut, GReturn> {
  next(...args: EnumeratorNextArguments<GIn>): EnumeratorResult<GOut, GReturn>;

  throw(error?: unknown): EnumeratorResult<GOut, GReturn>;

  return(...args: EnumeratorReturnArguments<GReturn>): EnumeratorResult<GOut, GReturn>;
}

export interface Enumerable<GIn, GOut, GReturn> {
  [Symbol.asyncIterator](): Enumerator<GIn, GOut, GReturn>;
}

export interface EnumeratorObject<GIn, GOut, GReturn>
  extends Enumerator<GIn, GOut, GReturn>,
    Disposable {
  [Symbol.asyncIterator](): EnumeratorObject<GIn, GOut, GReturn>;
}

// ASYNC

export interface AsyncEnumerator<GIn, GOut, GReturn> {
  next(...args: EnumeratorNextArguments<GIn>): Promise<EnumeratorResult<GOut, GReturn>>;

  throw(error?: unknown): Promise<EnumeratorResult<GOut, GReturn>>;

  return(...args: EnumeratorReturnArguments<GReturn>): Promise<EnumeratorResult<GOut, GReturn>>;
}

export interface AsyncEnumerable<GIn, GOut, GReturn> {
  [Symbol.asyncIterator](): AsyncEnumerator<GIn, GOut, GReturn>;
}

export interface AsyncEnumeratorObject<GIn, GOut, GReturn>
  extends AsyncEnumerator<GIn, GOut, GReturn>,
    AsyncDisposable {
  [Symbol.asyncIterator](): AsyncEnumeratorObject<GIn, GOut, GReturn>;
}

/*-------*/

export async function getEnumeratorResultValue<GOut>(
  result: EnumeratorResult<GOut, void>,
): Promise<GOut> {
  if (result.done) {
    throw new Error('No value');
  } else {
    return result.value;
  }
}

export async function getAsyncEnumeratorNextValue<GValue>(
  enumerator: AsyncEnumerator<any, GValue, void>,
): Promise<GValue> {
  return getEnumeratorResultValue(await enumerator.next());
}
