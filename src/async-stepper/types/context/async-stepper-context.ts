/**
 * The context of an async stepper.
 */
export interface AsyncStepperContext<GIn, GReturn> {
  /**
   * The _next_ value provided to the stepper when `.next(value)` is called.
   */
  readonly $next: AsyncStepperContextNext<GIn>;
  /**
   * The _next_ value provided to the stepper when `.return(value)` is called.
   */
  readonly $return: AsyncStepperContextReturn<GReturn>;
  /**
   * An abort signal, signaling that the stepper should abort.
   */
  readonly signal: AbortSignal;
}

export interface AsyncStepperContextNext<GIn> {
  (): GIn;
}

export interface AsyncStepperContextReturn<GReturn> {
  (): GReturn;
}
