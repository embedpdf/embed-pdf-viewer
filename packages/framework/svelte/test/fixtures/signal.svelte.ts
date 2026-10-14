/** A value a test changes from outside a component; a reader given `() => box.value` follows it. */
export function signal<T>(initial: T): { value: T } {
  let value = $state.raw(initial);
  return {
    get value() {
      return value;
    },
    set value(next: T) {
      value = next;
    },
  };
}
