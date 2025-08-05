import { isEnum } from '../../is-enum.js';
import { type Result } from '../result.js';
import { type ResultOk } from './result-ok.js';

export function isResultOk<GValue>(input: Result<GValue>): input is ResultOk<GValue> {
  return isEnum(input, 'Ok');
}
