import { resultErr } from '../err/result-err.js';
import { resultOk } from '../ok/result-ok.js';
import { type Result } from '../result.js';

export function tryFnc<GArguments extends readonly unknown[], GReturn>(
  fnc: (...args: GArguments) => GReturn,
  ...args: GArguments
): Result<GReturn> {
  try {
    return resultOk(fnc(...args));
  } catch (error: unknown) {
    return resultErr(error);
  }
}
