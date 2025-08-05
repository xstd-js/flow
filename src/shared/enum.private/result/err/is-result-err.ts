import { isEnum } from '../../is-enum.js';
import { type Result } from '../result.js';
import { type ResultErr } from './result-err.js';

export function isResultErr<GError>(input: Result<any, GError>): input is ResultErr<GError> {
  return isEnum(input, 'Err');
}
