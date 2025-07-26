import { describe, expect, it } from 'vitest';
import { AsyncReader } from './async-reader.js';

describe('AsyncReader', (): void => {
  it('should be constructable', (): void => {
    expect(() => new AsyncReader<any>(() => {})).not.toThrow();
  });
});
