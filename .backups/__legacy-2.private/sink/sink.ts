import { Source } from '../source/source.js';

export interface DrainSink<GValue> {
  (source: Source<GValue>, signal?: AbortSignal): PromiseLike<void> | void;
}

// export interface BridgeSink<GValue> {
//   (writable: WritableFlow<GValue>): PromiseLike<void> | void;
// }

export class Sink<GValue> {
  readonly #drain: DrainSink<GValue>;

  constructor(drain: DrainSink<GValue>) {
    this.#drain = drain;
  }

  async drain(source: Source<GValue>, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    return this.#drain(source, signal);
  }

  // bridge(bridge: BridgeSink<GValue>, options?: PushToPullOptions): Promise<void> {
  //   return this.drain(
  //     new Source(async (): Promise<ReadableFlow<GValue>> => {
  //       const { writable, readable } = new WritableFlowToReadableFlowBridge<GValue>(options);
  //
  //       Promise.try((): PromiseLike<void> | void => bridge(writable)).then(
  //         (): void => {
  //           writable.close();
  //         },
  //         (reason: unknown): void => {
  //           writable.close(reason);
  //         },
  //       );
  //
  //       return readable;
  //     }),
  //   );
  // }
}
