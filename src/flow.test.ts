import { ReadableFlow } from './flow/read/readable-flow/readable-flow.js';

/*----------*/

/*-----*/

/*-----*/

/*-----*/

/*-----*/

export async function debugFlowV2() {
  const readable = ReadableFlow.from(
    (async function* () {
      yield* [1, 2, 3];
      throw 'test';
    })(),
  ).flatMap(
    // async (value: number) => {
    //   return value * 2;
    // },
    (value: number): never => {
      throw 'oki';
    },
    async (error: unknown) => {
      console.log('error', error);
      // return 10;
      throw 'ok';
    },
  );

  console.log(await readable.last());

  // await using reader = await readable
  //   .open();
  //

  // while (true) {
  //   console.log(await reader.read());
  // }
}
