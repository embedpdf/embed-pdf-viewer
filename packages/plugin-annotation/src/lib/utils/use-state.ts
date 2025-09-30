/**
 * A simple, framework-agnostic state management utility for use within handlers.
 * It creates a closure to hold a value that persists across multiple calls
 * to the handler's methods (e.g., onPointerDown, onPointerMove).
 *
 * @param initialValue The initial value to store.
 * @returns A tuple containing:
 * - The current value.
 * - A function to set a new value.
 * - A function to get the current value without causing re-renders (useful inside closures).
 */
export function useState<T>(initialValue: T): [() => T, (newValue: T) => void] {
  let value = initialValue;
  const getValue = () => value;
  const setValue = (newValue: T) => {
    value = newValue;
  };
  return [getValue, setValue];
}
