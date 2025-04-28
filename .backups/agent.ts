// export class Source<GValue> {
//   async next(): Promise<GValue> {
//     throw 'TODO';
//   }
// }
//
// export class Sink<GValue> {
//   async next(): Promise<GValue> {
//     throw 'TODO';
//   }
// }

// export interface AgentNext<GIn, GOut> {
//   (input: GIn): PromiseLike<GOut> | GOut;
// }
//
// export interface AgentError<GOut> {
//   (error: unknown): PromiseLike<GOut> | GOut;
// }

// export class Agent<GIn, GOut> {
//   readonly #next: AgentNext<GIn, GOut>;
//   readonly #error: AgentError<GOut>;
//   #queue: Promise<any>;
//
//   constructor(next: AgentNext<GIn, GOut>, error: AgentError<GOut>) {
//     this.#next = next;
//     this.#error = error;
//     this.#queue = Promise.resolve();
//   }
//
//
//   get signal(): AbortSignal {
//
//   }
//
//   next(input: GIn): Promise<GOut> {
//     return (this.#queue = this.#queue.then((): PromiseLike<GOut> | GOut => {
//       return this.#next(input);
//     }));
//   }
//
//   error(error: unknown): Promise<GOut> {
//     return (this.#queue = this.#queue.then((): PromiseLike<GOut> | GOut => {
//       return this.#error(error);
//     }));
//   }
// }

export interface AgentNext<GIn, GOut> {
  (input: GIn): Agent<GOut, GIn>;
}

export interface AgentError<GIn, GOut> {
  (error: unknown): Agent<GOut, GIn>;
}

export interface Agent<GIn, GOut> {
  readonly next: AgentNext<GIn, GOut>;
  readonly error: AgentError<GIn, GOut>;
}

export interface AgentObserver<GIn, GOut> {
  (agent: Agent<GIn, GOut>): void;
}

function test() {
  const observer: AgentObserver<number, number> = (
    agent: Agent<number, number>,
  ): Agent<number, number> => {
    return {
      next: (value: number): Agent<number, number> => {
        // etc...
        return value * 2;
      },
      error: () => {
        throw 'TODO';
      },
    };
  };
}

// export class Agent<GIn, GOut> {
//   readonly #next: AgentNext<GIn, GOut>;
//   readonly #error: AgentError<GIn, GOut>;
//   #queue: Promise<any>;
//
//   constructor(next: AgentNext<GIn, GOut>, error: AgentError<GIn, GOut>) {
//     this.#next = next;
//     this.#error = error;
//     this.#queue = Promise.resolve();
//   }
//
//   // TODO explore this paradigm
//
//   next(observer: AgentObserver<GIn, GOut>): void {
//     return (this.#queue = this.#queue.then((): PromiseLike<GOut> | GOut => {
//       return this.#next(input);
//     }));
//   }
//
//   error(error: unknown): Promise<GOut> {
//     return (this.#queue = this.#queue.then((): PromiseLike<GOut> | GOut => {
//       return this.#error(error);
//     }));
//   }
// }
