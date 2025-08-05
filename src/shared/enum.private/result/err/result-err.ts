import { type Enum } from '../../enum.js';

export interface ResultErr<GError = unknown> extends Enum<'Err'> {
  readonly error: GError;
}

export function resultErr<GError>(error: GError): ResultErr<GError> {
  return {
    type: 'Err',
    error,
  };
}
