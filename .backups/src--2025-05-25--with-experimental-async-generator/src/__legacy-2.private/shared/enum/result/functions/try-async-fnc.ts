import { resultErr } from '../err/result-err.js';
import { resultOk } from '../ok/result-ok.js';
import { type Result } from '../result.js';

export async function tryAsyncFnc<GReturn, GError = unknown>(
  fnc: () => PromiseLike<GReturn> | GReturn,
): Promise<Result<GReturn, GError>> {
  try {
    return resultOk<GReturn>(await fnc());
  } catch (error: unknown) {
    return resultErr<GError>(error as GError);
  }
}
