import { resultErr } from '../err/result-err.js';
import { resultOk } from '../ok/result-ok.js';
import { type Result } from '../result.js';

export async function tryAsyncFnc<GArguments extends readonly unknown[], GReturn, GError = unknown>(
  fnc: (...args: GArguments) => PromiseLike<GReturn> | GReturn,
  ...args: GArguments
): Promise<Result<GReturn, GError>> {
  try {
    return resultOk<GReturn>(await fnc(...args));
  } catch (error: unknown) {
    return resultErr<GError>(error as GError);
  }
}
