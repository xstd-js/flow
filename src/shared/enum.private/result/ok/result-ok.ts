import { type Enum } from '../../enum.js';

export interface ResultOk<GValue> extends Enum<'Ok'> {
  readonly value: GValue;
}

export function resultOk<GValue>(value: GValue): ResultOk<GValue> {
  return {
    type: 'Ok',
    value,
  };
}
