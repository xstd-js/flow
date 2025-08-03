import { MapFunction } from '@xstd/functional';
import { ReadableFlow } from '../flow/readable/readable-flow.js';

export interface DrainFlow<GValue, GArguments extends readonly unknown[] = []> {
  (flow: ReadableFlow<GValue>, signal: AbortSignal, ...args: GArguments): PromiseLike<void> | void;
}

// export type DrainBridgeResult<GValue> = [
//   bridge: FlowAsyncBridge<GValue>,
//   finishedPromise: Promise<void>,
// ];

export class Drain<GValue, GArguments extends readonly unknown[] = []> {
  readonly #drain: DrainFlow<GValue, GArguments>;

  constructor(drain: DrainFlow<GValue, GArguments>) {
    this.#drain = drain;
  }

  async drain(flow: ReadableFlow<GValue>, signal: AbortSignal, ...args: GArguments): Promise<void> {
    await this.#drain(flow, signal, ...args);
  }

  // bridge(signal: AbortSignal): DrainBridgeResult<GValue> {
  //   const [bridge, flow]: FlowAsyncBridgeResult<GValue> = flowAsyncBridge<GValue>(signal);
  //
  //   return [
  //     bridge,
  //     this.drain(
  //       new ReadableFlow<GValue>(async function* (): ReadableFlowIterator<GValue> {
  //         yield* flow;
  //       }),
  //       signal,
  //     ),
  //   ];
  // }

  /* TRANSFORM */

  transform<GReturn>(transformFnc: MapFunction<this, GReturn>): GReturn {
    return transformFnc(this);
  }

  // transform<GNewValue>(transformFnc: MapFunction<GNewValue, GValue>): Drain<GNewValue> {
  //   return new Drain<GNewValue>(
  //     (flow: ReadableFlow<GNewValue>, signal: AbortSignal): Promise<void> => {
  //       // return this.drain(flow.transform<GValue>(transformFnc), signal);
  //       return this.drain(flow.transform<GValue>(transformFnc), signal);
  //     },
  //   );
  // }

  /* TRANSFORM THE DATA */

  // map<GNewValue>(mapFnc: MapFunction<GNewValue, GValue>): Drain<GNewValue> {
  //   return this.transform(
  //     (flow: ReadableFlow<GNewValue>): ReadableFlow<GValue> => flow.map(mapFnc),
  //   );
  //   // return new Drain<GNewValue>((flow: Flow<GNewValue>, signal: AbortSignal): Promise<void> => {
  //   //   return this.drain(flow.map(mapFnc), signal);
  //   // });
  // }
}
