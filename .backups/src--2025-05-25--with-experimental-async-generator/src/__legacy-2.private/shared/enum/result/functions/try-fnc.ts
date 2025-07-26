import { resultErr } from '../err/result-err.js';
import { resultOk } from '../ok/result-ok.js';
import { type Result } from '../result.js';

export function tryFnc<GReturn>(fnc: () => GReturn): Result<GReturn> {
  try {
    return resultOk(fnc());
  } catch (error: unknown) {
    return resultErr(error);
  }
}
