import { type AsyncStepperContext } from '../../async-stepper/types/context/async-stepper-context.js';

/**
 * An alias for a `AsyncStepperContext` that reads values from a fFlow.
 */
export type FlowContext = AsyncStepperContext<void, void>;
