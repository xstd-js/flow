import { sleep } from '@xstd/async-task';
import { describe, test } from 'vitest';
import { Flow, FlowFactoryContext } from './flow.js';

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

async function debugFlow01() {
  const controller = new AbortController();

  const flowA = new Flow(async function* () {
    try {
      yield* [0, 1, 2];
    } finally {
      console.log('flowA done');
    }
  });

  for await (const value of flowA.open(controller.signal)) {
    console.log(value);
  }
}

async function debugFlow02() {
  const controller = new AbortController();

  const flowA = new Flow(async function* () {
    try {
      yield* [0, 1, 2];
    } finally {
      console.log('flowA done');
    }
  });

  const flowB = new Flow(async function* (ctx) {
    try {
      yield* flowA.adopt(ctx);
    } finally {
      console.log('flowB done');
    }
  });

  for await (const value of flowB.open(controller.signal)) {
    console.log(value);
  }
}

async function debugFlow03() {
  const controller = new AbortController();

  const flowA = new Flow(async function* ({
    signal,
    $next,
  }: FlowFactoryContext<number, void>): AsyncGenerator<void, void, void> {
    while (true) {
      signal.throwIfAborted();
      console.log($next());
      yield;
    }
  });

  const flowB = new Flow(async function* (
    ctx: FlowFactoryContext<number, void>,
  ): AsyncGenerator<void, void, void> {
    try {
      yield* flowA.adopt(ctx);
    } finally {
      console.log('flowB done');
    }
  });

  const it = flowB.open(controller.signal);

  try {
    await it.next(1);
    controller.abort();
    // for (let i = 0; i < 3; i++) {
    //   await it.next(i);
    //   controller.abort();
    // }
    // await it.return();
  } catch (error: unknown) {
    console.log(error);
  }

  await sleep(600);
}

export async function debugFlow() {
  // await debugFlow00();
  // await debugFlow001();
  // await debugFlow002();
  // await debugFlow01();
  // await debugFlow02();
  await debugFlow03();
}

describe('abc', () => {
  globalThis.reportError = (error: unknown): void => {
    console.error(error);
  };

  test('deg', async () => {
    await debugFlow();
  });
});
