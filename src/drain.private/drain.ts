import { MapFunction } from '@xstd/functional';
import { ReadableFlow } from '../flow/readable/readable-flow.js';
import { FlowTransformFunction } from '../flow/readable/types/methods/transform/flow-transform-function.js';

export interface DrainFlow<GValue> {
  (flow: ReadableFlow<GValue>, signal: AbortSignal): PromiseLike<void> | void;
}

// export type DrainBridgeResult<GValue> = [
//   bridge: FlowAsyncBridge<GValue>,
//   finishedPromise: Promise<void>,
// ];

export class Drain<GValue> {
  readonly #drain: DrainFlow<GValue>;

  constructor(drain: DrainFlow<GValue>) {
    this.#drain = drain;
  }

  async drain(flow: ReadableFlow<GValue>, signal: AbortSignal): Promise<void> {
    await this.#drain(flow, signal);
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

  transform<GNewValue>(transformFnc: FlowTransformFunction<GNewValue, GValue>): Drain<GNewValue> {
    return new Drain<GNewValue>(
      (flow: ReadableFlow<GNewValue>, signal: AbortSignal): Promise<void> => {
        return this.drain(flow.transform<GValue>(transformFnc), signal);
      },
    );
  }

  /* TRANSFORM THE DATA */

  map<GNewValue>(mapFnc: MapFunction<GNewValue, GValue>): Drain<GNewValue> {
    return this.transform(
      (flow: ReadableFlow<GNewValue>): ReadableFlow<GValue> => flow.map(mapFnc),
    );
    // return new Drain<GNewValue>((flow: Flow<GNewValue>, signal: AbortSignal): Promise<void> => {
    //   return this.drain(flow.map(mapFnc), signal);
    // });
  }
}
