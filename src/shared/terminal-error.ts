import { CustomError, type CustomErrorOptions } from '@xstd/custom-error';

export interface TerminalErrorOptions extends CustomErrorOptions {
  readonly clean: boolean;
}

export class TerminalError extends CustomError<'TerminalError'> {
  static clean(options?: Omit<TerminalErrorOptions, 'clean'>): TerminalError {
    return new TerminalError({
      ...options,
      clean: true,
    });
  }

  static dirty(options?: Omit<TerminalErrorOptions, 'clean'>): TerminalError {
    return new TerminalError({
      ...options,
      clean: false,
    });
  }

  readonly clean: boolean;

  constructor({ clean, ...options }: TerminalErrorOptions) {
    super('TerminalError', options);
    this.clean = clean;
  }
}
