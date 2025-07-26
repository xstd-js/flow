export interface PushToPullOptions {
  readonly bufferSize?: number;
  readonly windowTime?: number;
}

export type OptionalPushToPullOptions = PushToPullOptions | void | undefined;
