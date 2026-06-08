import { beforeEach, describe, expect, it } from 'vitest';
import { Drain } from '../drain/drain.ts';
import { Flow } from '../flow/flow.ts';
import { DuplexFlow } from './duplex-flow.ts';

describe('DuplexFlow', () => {
  let controller: AbortController;

  beforeEach((): void => {
    controller = new AbortController();
  });

  describe('constructor', () => {
    it('should accept a generator functions', async () => {
      let value: string = 'none';

      const stream = new DuplexFlow<number, string>({
        input: Flow.of(1),
        output: new Drain(async (flow: Flow<string>, signal: AbortSignal) => {
          value = await flow.first(signal);
        }),
      });

      expect(await stream.input.first(controller.signal)).toBe(1);
      expect(value).toBe('none');

      await stream.output.drain(Flow.of('test'), controller.signal);
      expect(value).toBe('test');
    });
  });

  describe('methods', () => {
    describe('transform', async () => {
      it('should transform values', async () => {
        let value: string = 'none';

        const stream = new DuplexFlow<number, string>({
          input: Flow.of(1),
          output: new Drain(async (flow: Flow<string>, signal: AbortSignal) => {
            value = await flow.first(signal);
          }),
        }).transform((stream: DuplexFlow<number, string>): DuplexFlow<string, number> => {
          return new DuplexFlow<string, number>({
            input: stream.input.map(String),
            output: stream.output.transform((output: Drain<string>): Drain<number> => {
              return new Drain(async (flow: Flow<number>, signal: AbortSignal) => {
                return output.drain(flow.map(String), signal);
              });
            }),
          });
        });

        expect(await stream.input.first(controller.signal)).toBe('1');
        expect(value).toBe('none');

        await stream.output.drain(Flow.of(1), controller.signal);
        expect(value).toBe('1');
      });
    });
  });
});
