/**
 * A record read as refs, one per field: what a state or settings composable
 * returns without a selector, so `const { zoomLevel } = useStageState()` keeps
 * `zoomLevel` reactive after destructuring, and a template reads it unwrapped.
 */
import { computed } from 'vue';
import type { Ref } from 'vue';

/** One read-only ref per field of `Value`. */
export type FieldRefs<Value extends object> = {
  readonly [Key in keyof Value]-?: Readonly<Ref<Value[Key]>>;
};

/**
 * One computed ref per field of `whole`. Each field updates only when its own
 * value changes. The fields are the ones `whole` has now (`keys` names them
 * when they are known without a value): records read this way keep their
 * fields.
 */
export function fieldRefs<Value extends object>(
  whole: Readonly<Ref<Value>>,
  keys: readonly string[] = Object.keys(whole.value),
): FieldRefs<Value> {
  return Object.freeze(
    Object.fromEntries(
      keys.map((key) => [key, computed(() => (whole.value as Record<string, unknown>)[key])]),
    ),
  ) as unknown as FieldRefs<Value>;
}
