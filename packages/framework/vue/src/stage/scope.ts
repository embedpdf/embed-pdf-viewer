/**
 * Which stage lens a subtree binds to, so the stage composables and the
 * stage-bound chrome (`<Scrollbar>`, selection handles) need no token argument.
 * `<Stage>` provides its own lens to its pages and overlay; an app wraps a
 * second lens (a thumbnail rail) in `<StageScope :token>`. An explicit token
 * argument still wins everywhere.
 */
import { computed, inject, provide, toValue } from 'vue';
import type { InjectionKey, MaybeRefOrGetter, Ref } from 'vue';
import type { CapabilityToken } from '@embedpdf/core';
import { StageToken } from '@embedpdf/plugin-stage/contract';
import type { StageCapability } from '@embedpdf/plugin-stage/contract';

/** Which stage lens to bind to: the main `StageToken`, or the token of a second view. */
export type StageTokenProp = CapabilityToken<StageCapability>;

const StageTokenKey: InjectionKey<Readonly<Ref<StageTokenProp>>> = Symbol('embedpdf stage token');

/** Bind this subtree to a stage lens: what `<Stage>` and `<StageScope>` do. */
export function provideStageToken(token: MaybeRefOrGetter<StageTokenProp>): void {
  provide(
    StageTokenKey,
    computed(() => toValue(token)),
  );
}

/**
 * The lens a stage composable binds to: the explicit argument, else the
 * nearest `<StageScope>` / `<Stage>`, else the main lens.
 */
export function useStageToken(
  explicit?: MaybeRefOrGetter<StageTokenProp | undefined>,
): Readonly<Ref<StageTokenProp>> {
  const scoped = inject(StageTokenKey, null);
  return computed(() => toValue(explicit) ?? scoped?.value ?? StageToken);
}
