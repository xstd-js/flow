import { describe, test } from 'vitest';
import { Source } from './source/source.js';

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

/*-------------*/

async function debugFlow00() {
  const items = Source.from([1, 2, 3]).flatMap((i) => Source.from([i * 2]));

  for await (const item of await items.open()) {
    console.log(item);
  }
}

export async function debugFlow() {
  await debugFlow00();
}

describe('abc', () => {
  globalThis.reportError = (error: unknown): void => {
    console.error(error);
  };

  test('deg', async () => {
    await debugFlow();
  });
});
