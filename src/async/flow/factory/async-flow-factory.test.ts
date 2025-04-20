import { sleep } from '@xstd/async-task';
import { describe, expect, it } from 'vitest';
import { AsyncFlow } from '../flow/async-flow.js';
import { AsyncFlowFactory } from './async-flow-factory.js';

describe('AsyncFlowFactory', (): void => {
  describe('static methods', (): void => {
    describe.todo('openMany', (): void => {});
  });

  describe('methods', (): void => {
    describe('open', (): void => {
      it('should be openable', async (): Promise<void> => {
        let nextCount: number = 0;

        const flow = new AsyncFlowFactory<AsyncFlow<[string], number>>(() => {
          return new AsyncFlow<[string], number>((input: string): number => {
            nextCount++;

            if (nextCount === 1) {
              expect(input).toBe('a');
            } else if (nextCount === 2) {
              expect(input).toBe('b');
            }

            return nextCount;
          });
        });

        const p = flow.open();

        await expect(p).resolves.toBeDefined();

        const reader = await p;

        await expect(reader.next('a')).resolves.toBe(1);
        await expect(reader.next('b')).resolves.toBe(2);
      });
    });

    describe('once', (): void => {
      it('should open the flow, call next and return the result', async (): Promise<void> => {
        let nextCount: number = 0;

        const flow = new AsyncFlowFactory<AsyncFlow<[string], number>>(() => {
          return new AsyncFlow<[string], number>((input: string): number => {
            nextCount++;

            if (nextCount === 1) {
              expect(input).toBe('a');
            } else {
              expect.unreachable();
            }

            return nextCount;
          });
        });

        expect(nextCount).toBe(0);

        await expect(flow.once('a')).resolves.toBe(1);
        expect(nextCount).toBe(1);
      });

      it('should be abortable', async (): Promise<void> => {
        let nextCount: number = 0;

        const flow = new AsyncFlowFactory<AsyncFlow<[string], number>>(() => {
          return new AsyncFlow<[string], number>(
            async (input: string, signal: AbortSignal): Promise<never> => {
              nextCount++;

              if (nextCount === 1) {
                expect(input).toBe('a');
              } else {
                expect.unreachable();
              }

              await sleep(100, signal);

              expect.unreachable();
            },
          );
        });

        const controller = new AbortController();

        expect(nextCount).toBe(0);

        const p = flow.once('a', controller.signal);

        await sleep(10);
        expect(nextCount).toBe(1);

        controller.abort('aborted');

        await expect(p).rejects.toBe('aborted');
        expect(nextCount).toBe(1);
      });
    });
  });
});
