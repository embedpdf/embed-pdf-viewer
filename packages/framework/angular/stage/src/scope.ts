/**
 * Stage scoping — React's `<StageScope>` as hierarchical DI. `<epdf-stage>`
 * provides its own lens to everything projected into it, and
 * `[epdfStageScope]` binds any subtree (a thumbnail rail's chrome) to a lens,
 * so the stage facades and `<epdf-scrollbar>`-style chrome need no positional
 * token. An explicit token argument still wins everywhere.
 */
import {
  computed,
  Directive,
  forwardRef,
  inject,
  InjectionToken,
  input,
  type Signal,
} from '@angular/core';
import { StageToken } from '@embedpdf/plugin-stage';
import type { StageCapability } from '@embedpdf/plugin-stage';
import type { CapabilityToken } from '@embedpdf/angular/runtime';

/** Which stage lens to bind to. Defaults to the main StageToken — pass a custom
 *  token to drive an additional lens (e.g. a wrapped thumbnail sidebar). */
export type StageTokenProp = CapabilityToken<StageCapability>;

/** The lens a subtree is bound to (provided by `<epdf-stage>` and `[epdfStageScope]`). */
export interface EpdfStageScopeRef {
  readonly stageToken: Signal<StageTokenProp>;
}

export const EPDF_STAGE_SCOPE = new InjectionToken<EpdfStageScopeRef>('EPDF_STAGE_SCOPE');

@Directive({
  selector: '[epdfStageScope]',
  standalone: true,
  providers: [{ provide: EPDF_STAGE_SCOPE, useExisting: forwardRef(() => EpdfStageScope) }],
})
export class EpdfStageScope implements EpdfStageScopeRef {
  readonly stageToken = input.required<StageTokenProp>({ alias: 'epdfStageScope' });
}

/** The lens a stage facade binds to: the explicit argument, else the nearest
 *  `<epdf-stage>` / `[epdfStageScope]`, else the main lens. A signal, because
 *  a scope's token is an input. */
export function injectStageToken(explicit?: StageTokenProp): Signal<StageTokenProp> {
  const scope = inject(EPDF_STAGE_SCOPE, { optional: true });
  return computed(() => explicit ?? scope?.stageToken() ?? StageToken);
}
