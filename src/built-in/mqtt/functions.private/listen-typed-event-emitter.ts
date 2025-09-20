export type EventHandler =
  | ((arg1: any, arg2: any, arg3: any, arg4: any) => void)
  | ((arg1: any, arg2: any, arg3: any) => void)
  | ((arg1: any, arg2: any) => void)
  | ((arg1: any) => void)
  | ((...args: any[]) => void);

export interface TypedEventEmitter<TEvents extends Record<keyof TEvents, EventHandler>> {
  on<TEvent extends keyof TEvents>(event: TEvent, callback: TEvents[TEvent]): this;
  off<TEvent extends keyof TEvents>(event: TEvent, callback: TEvents[TEvent]): this;
}

// export type InferTypedEventEvents<GTarget extends TypedEventEmitter<any>> =
//   GTarget extends TypedEventEmitter<infer TEvents> ? TEvents : never;

export function listenTypedEventEmitter<
  TEvents extends Record<keyof TEvents, EventHandler>,
  TEvent extends keyof TEvents,
>(target: TypedEventEmitter<TEvents>, event: TEvent, callback: TEvents[TEvent]): Disposable {
  target.on<TEvent>(event, callback);

  return {
    [Symbol.dispose](): void {
      target.off<TEvent>(event, callback);
    },
  };
}

export function addTypedEventEmitterListener<
  TEvents extends Record<keyof TEvents, EventHandler>,
  TEvent extends keyof TEvents,
>(
  target: TypedEventEmitter<TEvents>,
  event: TEvent,
  callback: TEvents[TEvent],
  signal: AbortSignal,
): void {
  if (signal.aborted) {
    return;
  }
  target.on<TEvent>(event, callback);

  signal.addEventListener('abort', () => {
    target.off<TEvent>(event, callback);
  });
}

// export function listenTypedEventEmitter<
//   GTarget extends TypedEventEmitter<any>,
//   TEvent extends InferTypedEventEvents<GTarget>,
// >(target: GTarget, event: TEvent, callback: InferTypedEventEvents<GTarget>[TEvent]): Disposable {
//   target.on<TEvent>(event, callback);
//
//   return {
//     [Symbol.dispose](): void {
//       target.off<TEvent>(event, callback);
//     },
//   };
// }
