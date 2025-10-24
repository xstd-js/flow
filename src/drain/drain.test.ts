import { beforeEach, describe, expect, it } from 'vitest';
import { ReadableFlow } from '../flow/readable/readable-flow.js';
import { Drain } from './drain.js';

describe('Drain', () => {
  let controller: AbortController;

  beforeEach((): void => {
    controller = new AbortController();
  });

  describe('methods', () => {
    describe('open', () => {
      it('should consume a flow', async () => {
        const drain = new Drain(async function (
          flow: ReadableFlow<number, []>,
          signal: AbortSignal,
        ): Promise<number> {
          return flow.reduce(
            signal,
            (sum: number, value: number): number => {
              return sum + value;
            },
            0,
          );
        });

        await expect(
          drain.drain(ReadableFlow.fromArray([0, 1, 2]), controller.signal),
        ).resolves.toBe(3);
      });
    });

    describe('transform', () => {
      it('should consume a flow', async () => {
        const drain = new Drain<number, number>(async function (
          flow: ReadableFlow<number, []>,
          signal: AbortSignal,
        ): Promise<number> {
          return flow.reduce(
            signal,
            (sum: number, value: number): number => {
              return sum + value;
            },
            0,
          );
        }).transform((drain: Drain<number, number>) => {
          return new Drain<string, number>(async function (
            flow: ReadableFlow<string, []>,
            signal: AbortSignal,
          ): Promise<number> {
            return drain.drain(flow.map(Number), signal);
          });
        });

        await expect(
          drain.drain(ReadableFlow.fromArray(['0', '1', '2']), controller.signal),
        ).resolves.toBe(3);
      });
    });
  });
});
