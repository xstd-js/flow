import type { MapFunction } from '@xstd/functional';
import type { Drain } from '../drain/drain.ts';
import type { Flow } from '../flow/flow.ts';

export interface DuplexFlowLike<GInput, GOutput> {
  readonly input: Flow<GInput>;
  readonly output: Drain<GOutput>;
}

export class DuplexFlow<GInput, GOutput> {
  readonly #input: Flow<GInput>;
  readonly #output: Drain<GOutput>;

  constructor({ input, output }: DuplexFlowLike<GInput, GOutput>) {
    this.#input = input;
    this.#output = output;
  }

  get input(): Flow<GInput> {
    return this.#input;
  }

  get output(): Drain<GOutput> {
    return this.#output;
  }

  /* TRANSFORM */

  transform<GReturn>(transformFnc: MapFunction<this, GReturn>): GReturn {
    return transformFnc(this);
  }
}
