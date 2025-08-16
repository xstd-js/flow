export type PickNonOptional<T> = {
  [K in keyof T as T extends Record<K, T[K]> ? K : never]-?: T[K];
};
