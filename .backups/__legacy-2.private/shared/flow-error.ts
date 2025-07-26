import { CustomError, CustomErrorOptions } from '@xstd/custom-error';

export type FlowErrorOfOptions = Omit<FlowErrorOptions, 'type'> &
  Partial<Pick<FlowErrorOptions, 'type'>>;

export interface FlowErrorOptions extends CustomErrorOptions {
  readonly type: FlowErrorType;
}

export type FlowErrorType = 'recoverable' | 'fatal' | 'complete';

export class FlowError extends CustomError<'FlowError'> {
  static of(error: unknown, options?: FlowErrorOfOptions): FlowError {
    if (error instanceof FlowError) {
      return error;
    }

    return new FlowError({
      type: 'fatal',
      ...options,
      cause: error,
    });
  }

  static recoverable(options?: Omit<FlowErrorOptions, 'type'>): FlowError {
    return new FlowError({
      ...options,
      type: 'recoverable',
    });
  }

  static fatal(options?: Omit<FlowErrorOptions, 'type'>): FlowError {
    return new FlowError({
      ...options,
      type: 'fatal',
    });
  }

  static complete(options?: Omit<FlowErrorOptions, 'type'>): FlowError {
    return new FlowError({
      ...options,
      type: 'complete',
    });
  }

  readonly type: FlowErrorType;

  constructor({ type, ...options }: FlowErrorOptions) {
    super('FlowError', {
      message: type,
      ...options,
    });
    this.type = type;
  }

  // get terminal(): boolean {
  //   return this.type === 'fatal' || this.type === 'complete';
  // }
}
