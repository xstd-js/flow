import { describe, expect, it } from 'vitest';
import { AsyncReader } from '../reader/async-reader.js';
import { AsyncReadable } from './async-readable.js';

describe('AsyncReadable', (): void => {
  describe('static methods', (): void => {
    describe.todo('from', (): void => {});
  });

  describe('methods', (): void => {
    describe('open', (): void => {
      it('should be openable', async (): Promise<void> => {
        let nextCount: number = 0;

        const readable: AsyncReadable<number> = new AsyncReadable<number>(() => {
          return new AsyncReader(() => {
            return nextCount++;
          });
        });

        const p = readable.open();

        await expect(p).resolves.toBeDefined();

        const reader = await p;

        await expect(reader.next()).resolves.toBe(0);
        await expect(reader.next()).resolves.toBe(1);
      });
    });
  });
});
