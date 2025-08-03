import { sleep } from '@xstd/async-task';
import { describe, test } from 'vitest';
import { ReadableFlow } from './flow/readable/readable-flow.js';
import { ReadableFlowContext } from './flow/readable/types/readable-flow-context.js';

/*--------*/

/*-------------*/

async function debugFlow00() {
  const a = async function* (this: any) {
    console.log(this);
    yield 1;
    console.log(this);
  };

  const it = a();
  // const it = a.call({ a: 1 });
  for await (const i of it) {
    console.log(i);
  }
}

async function debugFlow001() {
  // const a = writableGenerator<[], number, boolean, string>(
  //   function* (): WritableGeneratorInFunctionReturn<number, boolean, string> {
  //     console.log('yield 1', yield true);
  //     console.log('yield 2', yield false);
  //     console.log('yield 3', yield true);
  //     console.log('yield 4', yield false);
  //
  //     return 'a';
  //   },
  // );
  //
  // const it = a();
  // console.log('next 0', it.next(0));
  // console.log('next 1', it.next(1));
  // console.log('return - 0', it.return());
  // // it.throw('ok');
  // console.log('next 2', it.next(2));
  // console.log('next 3', it.next(3));
}

async function debugFlow002() {
  const a = async function* () {
    await sleep(200);
    yield 0;
    yield 1;
    yield 2;
  };

  const it: AsyncIterable<number> = {
    [Symbol.asyncIterator](): AsyncIterator<number> {
      return {
        async next(): Promise<IteratorResult<number>> {
          return {
            done: false,
            value: 0,
          };
        },
        async throw(error?: unknown): Promise<IteratorResult<number>> {
          console.log('error', error);
          return {
            done: true,
            value: undefined,
          };
        },
        async return(value: any): Promise<IteratorResult<number>> {
          console.log('return', value);
          return {
            done: true,
            value,
          };
        },
      };
    },
  };

  // const it: AsyncGenerator<number> = a();

  // console.log(await it.next());
  // try {
  //   console.log(await it.throw('abc'));
  // } catch (error: unknown) {
  //   console.log(error);
  // }
  // // console.log(await it.throw('def'));
  // console.log(await it.next());

  // try {
  //   console.log(await it.next());
  //   console.log(await it.next());
  //   console.log(await it.next());
  // } catch (error: unknown) {
  //   console.log(error);
  // }
  // // console.log(await it.throw('def'));
  // console.log(await it.next());

  // console.log(await Promise.all([it.next(), it.return(undefined), it.next()]));

  for await (const i of it) {
    console.log(i);
    // return;
    throw 'e';
  }
}

async function debugFlow01() {
  const controller = new AbortController();

  const flowA = new ReadableFlow<number>(async function* (signal: AbortSignal) {
    // yield* Flow.fromIterable([0, 1, 2]).open(signal);
    try {
      yield* [0, 1, 2];
    } finally {
      console.log('flowA done');
    }
  });

  const flowB = new ReadableFlow<number>(async function* (signal: AbortSignal) {
    try {
      yield* flowA.open(signal);
      signal.throwIfAborted();
      yield 3;
    } finally {
      console.log('flowB done');
    }
  });
  // .map((i) => i * 2)
  // .filter((i) => i > 2);
  // .take(1);
  // .drop(1);
  // .inspect(inspectFlow('flowB'));

  // const a = flowA.open(controller.signal);
  // console.log(await a.next());
  // controller.abort('abc');
  // console.log(await a.next());
  // console.log(await a.throw('ok'));
  // await sleep(500);

  for await (const i of flowB.open(controller.signal)) {
    console.log(i);
    controller.abort('abc');
    // return;
  }
}

async function debugFlow02() {
  const controller = new AbortController();

  const flowA = new ReadableFlow<number>(async function* ({ signal }: ReadableFlowContext) {
    for (let i: number = 0; i < 4; i++) {
      signal.throwIfAborted();
      yield i;
      await sleep(100, signal);
    }
  });

  const flowB = flowA.edge();
  const flowC = flowA.edge();

  await Promise.allSettled([
    (async () => {
      for await (const i of flowB.open(controller.signal)) {
        console.log('flowB', i);
      }
    })(),
    (async () => {
      await sleep(250, controller.signal);
      for await (const i of flowC.open(controller.signal)) {
        console.log('flowC', i);
      }
    })(),
    // (async () => {
    //   await sleep(150, controller.signal);
    //   controller.abort();
    // })(),
  ]);

  for await (const i of flowB.open(new AbortController().signal)) {
    console.log('flowB->', i);
  }
  console.log('ok');
}

export async function debugFlow() {
  // await debugFlow00();
  // await debugFlow001();
  // await debugFlow002();
  // await debugFlow01();
  await debugFlow02();
}

describe('abc', () => {
  globalThis.reportError = (error: unknown): void => {
    console.error(error);
  };

  test('deg', async () => {
    await debugFlow();
  });
});
