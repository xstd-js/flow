import { sleep } from '@xstd/async-task';
import { describe, test } from 'vitest';
import { Flow } from './flow/flow.js';

/*--------*/

// export interface FlowSyncBridgeOptions {
//   readonly bufferSize?: number;
//   readonly windowTime?: number;
// }

/*--------*/

// export class UnderlyingRessource implements AsyncDisposable {
//
// }

// export class Task<GArgumnets extends readonly any[], GReturn> {
//   invoke(...args: [...args: GReturn]): Promise<GReturn> {
//
//   }
// }

/*--------*/

/*--*/

export interface DrainFlow<GValue> {
  (flow: Flow<GValue>, signal: AbortSignal): PromiseLike<void> | void;
}

export class Drain<GValue> {
  readonly #drain: DrainFlow<GValue>;

  constructor(drain: DrainFlow<GValue>) {
    this.#drain = drain;
  }

  async drain(flow: Flow<GValue>, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    return this.#drain(flow, signal);
  }
}

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

  // const it: AsyncIterable<number> = {
  //   [Symbol.asyncIterator](): AsyncIterator<number> {
  //     return {
  //       async next(): Promise<IteratorResult<number>> {
  //         return {
  //           done: false,
  //           value: 0,
  //         };
  //       },
  //       async throw(error?: unknown): Promise<IteratorResult<number>> {
  //         console.log('error', error);
  //         return {
  //           done: true,
  //           value: undefined,
  //         };
  //       },
  //       async return(value: any): Promise<IteratorResult<number>> {
  //         console.log('return', value);
  //         return {
  //           done: true,
  //           value,
  //         };
  //       },
  //     };
  //   },
  // };

  const it: AsyncGenerator<number> = a();

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

  console.log(await Promise.all([it.next(), it.return(undefined), it.next()]));

  // for await (const i of it) {
  //   console.log(i);
  //   // return;
  //   throw 'e';
  // }
}

async function debugFlow01() {
  const controller = new AbortController();

  const flowA = new Flow<number>(async function* (signal: AbortSignal) {
    // yield* Flow.fromIterable([0, 1, 2]).open(signal);
    try {
      yield* [0, 1, 2];
    } finally {
      console.log('flowA done');
    }
  });

  const flowB = new Flow<number>(async function* (signal: AbortSignal) {
    try {
      yield* flowA.open(signal);
      signal.throwIfAborted();
      yield 3;
    } finally {
      console.log('flowB done');
    }
  });
  // .map((i) => i * 2)
  // .filter((i) => i > 2)
  // .take(1)
  // .drop(1);

  // const a = flowA.open(controller.signal);
  // console.log(await a.next());
  // controller.abort('abc');
  // console.log(await a.next());
  // console.log(await a.throw('ok'));

  for await (const i of flowB.open(controller.signal)) {
    console.log(i);
    controller.abort('abc');
    return;
  }
}

export async function debugFlow() {
  // await debugFlow00();
  // await debugFlow001();
  // await debugFlow002();
  await debugFlow01();
}

describe('abc', () => {
  globalThis.reportError = (error: unknown): void => {
    console.error(error);
  };

  test('deg', async () => {
    await debugFlow();
  });
});
