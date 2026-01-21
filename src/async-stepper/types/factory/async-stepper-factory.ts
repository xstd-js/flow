import { type AsyncStepperContext } from '../context/async-stepper-context.ts';

/**
 * The function to provide to an async stepper.
 *
 * It's an `AsyncGenerator` factory that takes as parameters an `AsyncStepperContext`, and a list of predefined arguments.
 */
export interface AsyncStepperFactory<GIn, GOut, GReturn, GArguments extends readonly unknown[]> {
  (
    ctx: AsyncStepperContext<GIn, GReturn>,
    ...args: GArguments
  ): AsyncGenerator<GOut, GReturn, void>;
}
