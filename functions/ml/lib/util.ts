export function truthyFilter<T>(v: T | undefined | null): v is T {
  return !!v;
}