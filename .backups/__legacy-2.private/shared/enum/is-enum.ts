import { type Enum } from './enum.js';

export function isEnum<GType extends string, GEnum extends Enum<GType>>(
  input: Enum<any>,
  type: GType,
): input is GEnum {
  return input.type === type;
}
