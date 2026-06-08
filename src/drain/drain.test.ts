import { sleep } from '@xstd/abortable';
import { beforeEach, describe, expect, it } from 'vitest';
import { Flow } from '../flow/flow.ts';
import { Drain, type DrainWritableStreamFactoryResult } from './drain.ts';

describe('Drain', () => {
  let controller: AbortController;

  beforeEach((): void => {
    controller = new AbortController();
  });

  describe('static-methods', () => {
    describe('fromWritableStreamFactory', () => {
      it('should consume a flow', async () => {
        const written: number[] = [];

        const drain = Drain.fromWritableStreamFactory<number, string>(
          (): DrainWritableStreamFactoryResult<number, string, []> => {
            return {
              stream: new WritableStream<number>({
                write: async (
                  value: number,
                  controller: WritableStreamDefaultController,
                ): Promise<void> => {
                  await sleep(50, { signal: controller.signal });
                  written.push(value);
                },
              }),
              flowArguments: [],
              complete: () => 'a',
            };
          },
        );

        await expect(drain.drain(Flow.fromArray([0, 1, 2]), controller.signal)).resolves.toBe('a');

        expect(written).toEqual([0, 1, 2]);
      });

      it('should be abortable', async () => {
        const written: number[] = [];

        const drain = Drain.fromWritableStreamFactory<number, string>(
          (): DrainWritableStreamFactoryResult<number, string, []> => {
            return {
              stream: new WritableStream<number>({
                write: async (
                  value: number,
                  controller: WritableStreamDefaultController,
                ): Promise<void> => {
                  await sleep(50, { signal: controller.signal });
                  written.push(value);
                },
              }),
              flowArguments: [],
              complete: () => 'a',
            };
          },
        );

        await expect(
          drain.drain(
            new Flow<number>(async function* ({ signal }) {
              yield 0;
              yield 1;
              controller.abort('abort');
              signal.throwIfAborted();
              yield 2;
            }),
            controller.signal,
          ),
        ).rejects.toThrow('abort');

        expect(written).toEqual([0, 1]);
      });
    });
  });

  describe('methods', () => {
    describe('open', () => {
      it('should consume a flow', async () => {
        const drain = new Drain(async function (
          flow: Flow<number, []>,
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

        await expect(drain.drain(Flow.fromArray([0, 1, 2]), controller.signal)).resolves.toBe(3);
      });
    });

    describe('transform', () => {
      it('should consume a flow', async () => {
        const drain = new Drain<number, number>(async function (
          flow: Flow<number, []>,
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
            flow: Flow<string, []>,
            signal: AbortSignal,
          ): Promise<number> {
            return drain.drain(flow.map(Number), signal);
          });
        });

        await expect(drain.drain(Flow.fromArray(['0', '1', '2']), controller.signal)).resolves.toBe(
          3,
        );
      });
    });

    describe('transformFlow', () => {
      it('should transform a flow', async () => {
        const drain = new Drain<number, number>(async function (
          flow: Flow<number, []>,
          signal: AbortSignal,
        ): Promise<number> {
          return flow.reduce(
            signal,
            (sum: number, value: number): number => {
              return sum + value;
            },
            0,
          );
        }).transformFlow((flow: Flow<string>): Flow<number> => {
          return flow.map(Number);
        });

        await expect(drain.drain(Flow.fromArray(['0', '1', '2']), controller.signal)).resolves.toBe(
          3,
        );
      });
    });
  });
});
