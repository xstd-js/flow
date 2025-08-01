import { type FlowInspectOptions } from '../types/methods/inspect/flow-inspect-options.js';

const COLOR_SCHEME =
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? {
        light: '75%',
        open: '#35e062',
        next: '#70bcff',
        error: '#ff5a5a',
        close: '#f6a62e',
      }
    : {
        light: '25%',
        open: '#2dba52',
        next: '#0e82e8',
        error: '#ff2222',
        close: '#fda31b',
      };

export function inspectFlow<GValue>(
  name: string,
  color: string = `hsl(${Math.floor(Math.random() * 360).toString(10)}deg, 100%, ${COLOR_SCHEME.light})`,
): FlowInspectOptions<GValue> {
  return {
    open: (): void => {
      console.log(`%c[OPEN]%c ${name}`, `color: ${COLOR_SCHEME.open}`, `color: ${color}`);
    },
    next: (value: GValue): void => {
      console.log(`%c[NEXT]%c ${name}`, `color: ${COLOR_SCHEME.next}`, `color: ${color}`, value);
    },
    error: (error: unknown): void => {
      console.log(`%c[ERROR]%c ${name}`, `color: ${COLOR_SCHEME.error}`, `color: ${color}`, error);
    },
    close: (): void => {
      console.log(`%c[CLOSE]%c ${name}`, `color: ${COLOR_SCHEME.close}`, `color: ${color}`);
    },
  };
}
