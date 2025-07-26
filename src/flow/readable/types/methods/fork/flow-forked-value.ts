export interface FlowForkedValue<GValue> {
  readonly value: GValue;
  readonly time: number;
  readonly isEdge: boolean;
}

// export interface FlowForkedValueIsLastFunction {
//   (): boolean;
// }
//
// export interface FlowForkedValueOptions<GValue> {
//   readonly value: GValue;
//   readonly time?: number;
//   readonly isLast: FlowForkedValueIsLastFunction;
// }
//
// export class FlowForkedValue<GValue> {
//   readonly #value: GValue;
//   readonly #time: number;
//   readonly #isLast: FlowForkedValueIsLastFunction;
//
//   constructor({ value, time = Date.now(), isLast }: FlowForkedValueOptions<GValue>) {
//     this.#value = value;
//     this.#time = time;
//     this.#isLast = isLast;
//   }
//
//   get value(): GValue {
//     return this.#value;
//   }
//
//   get time(): number {
//     return this.#time;
//   }
//
//   isLast(): boolean {
//     return this.#isLast();
//   }
// }
