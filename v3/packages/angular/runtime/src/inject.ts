/**
 * The inject* primitives — Angular's spelling of the React runtime hooks
 * (`use*` → `inject*`, plain values → signals, same names otherwise).
 *
 * All of them must run in an injection context (a constructor / field
 * initializer, like `inject()` itself). None of them read `host.kernel` during
 * construction — they return signals or lazy methods, so they are safe in
 * component-hosted mode where the kernel materializes after construction.
 */
import { computed, inject, type Signal } from '@angular/core';
import { docInfoListEquals } from '@embedpdf-x/kernel';
import type { CapabilityToken, DocInfo, Kernel } from '@embedpdf-x/kernel';
import { EpdfKernelHost } from './kernel-host';
import { EPDF_DOCUMENT_SCOPE } from './tokens';

export const shallowArray = <T>(a: readonly T[], b: readonly T[]): boolean =>
  a === b || (a.length === b.length && a.every((x, i) => x === b[i]));

export function injectKernelHost(): EpdfKernelHost {
  const host = inject(EpdfKernelHost, { optional: true });
  if (!host) {
    throw new Error(
      '[embedpdf] no kernel: wrap this subtree in <epdf-viewer> or add provideEmbedPdf(...) to your providers',
    );
  }
  return host;
}

/** The raw kernel — materializes it immediately. Do NOT call while a component
 *  is being constructed in component-hosted mode (inputs are not set yet);
 *  prefer the signal-returning primitives, which defer the first kernel read. */
export function injectKernel(): Kernel {
  return injectKernelHost().kernel;
}

/** Read a value derived from the kernel, cached by equality — `useKernelValue`. */
export function injectKernelValue<R>(
  select: (kernel: Kernel) => R,
  equal?: (a: R, b: R) => boolean,
): Signal<R> {
  return injectKernelHost().value(select, equal);
}

export function injectActiveDocumentId(): Signal<string | null> {
  return injectKernelValue((k) => k.documents.activeId());
}

/** The document id for this injector subtree: the nearest `[epdfDocumentScope]`,
 *  else the active document. */
export function injectDocumentId(): Signal<string | null> {
  const scope = inject(EPDF_DOCUMENT_SCOPE, { optional: true });
  const active = injectActiveDocumentId();
  return computed(() => scope?.id() ?? active());
}

/**
 * Resolve a capability against a REACTIVE token — for components that take the
 * token as an input (`injectCapability` is the fixed-token sugar). Resolution
 * is a REACTIVE read (`tryCapability` through the kernel's one change
 * stream), not a computed over the document id — under the request-time
 * lifecycle a document can become resolvable while its id stays the same, so
 * any id-keyed cache goes stale; subscribing makes staleness structurally
 * impossible. Fail-fast like React's `useCapability`: while unresolvable,
 * this re-runs the strict resolver so the kernel's truthful reason (`no
 * capability` / `no document` / `document is loading|locked`) is what throws.
 */
export function injectCapabilityFor<T>(token: () => CapabilityToken<T>): Signal<T> {
  const host = injectKernelHost();
  const scope = inject(EPDF_DOCUMENT_SCOPE, { optional: true });
  const cap = host.value((k) => k.tryCapability(token(), scope?.id() ?? undefined));
  return computed(() => cap() ?? host.kernel.capability(token(), scope?.id() ?? undefined));
}

export function injectCapability<T>(token: CapabilityToken<T>): Signal<T> {
  return injectCapabilityFor(() => token);
}

/** Like `injectCapabilityFor`, but null while the token can't resolve (no
 *  plugin, no document, or a document that isn't ready yet). */
export function injectOptionalCapabilityFor<T>(token: () => CapabilityToken<T>): Signal<T | null> {
  const host = injectKernelHost();
  const scope = inject(EPDF_DOCUMENT_SCOPE, { optional: true });
  return host.value((k) => k.tryCapability(token(), scope?.id() ?? undefined));
}

export function injectOptionalCapability<T>(token: CapabilityToken<T>): Signal<T | null> {
  return injectOptionalCapabilityFor(() => token);
}

/** Subscribe to a selector over a (document-resolved) capability. */
export function injectSelectorFor<C, R>(
  token: () => CapabilityToken<C>,
  select: (cap: C) => R,
  equal?: (a: R, b: R) => boolean,
): Signal<R> {
  const host = injectKernelHost();
  const cap = injectCapabilityFor(token);
  return host.value(() => select(cap()), equal);
}

export function injectSelector<C, R>(
  token: CapabilityToken<C>,
  select: (cap: C) => R,
  equal?: (a: R, b: R) => boolean,
): Signal<R> {
  return injectSelectorFor(() => token, select, equal);
}

/**
 * Null-safe `injectSelector`: `fallback` whenever the token can't resolve — no
 * provider, or a document-scoped token with no document. For chrome that stays
 * mounted across the empty-workspace state (a zoom readout, a mode band).
 * `injectSelector` stays strict (fail-fast) for code that KNOWS a document
 * exists — e.g. anything behind the document gate.
 *
 * The `select` guard also swallows reads through a capability whose document
 * closed between the store notification and this read — that teardown race
 * resolves to `fallback` for one frame, then recomputes against the new state.
 */
export function injectOptionalSelectorFor<C, R>(
  token: () => CapabilityToken<C>,
  select: (cap: C) => R,
  fallback: R,
  equal?: (a: R, b: R) => boolean,
): Signal<R> {
  const host = injectKernelHost();
  const cap = injectOptionalCapabilityFor(token);
  return host.value(() => {
    const c = cap();
    if (c === null) return fallback;
    try {
      return select(c);
    } catch {
      return fallback;
    }
  }, equal);
}

export function injectOptionalSelector<C, R>(
  token: CapabilityToken<C>,
  select: (cap: C) => R,
  fallback: R,
  equal?: (a: R, b: R) => boolean,
): Signal<R> {
  return injectOptionalSelectorFor(() => token, select, fallback, equal);
}

/** The document registry (open/close/active/list), reactive — `useDocuments`.
 *  Methods late-bind the kernel, so this is construction-safe. */
export interface EpdfDocuments {
  docs: Signal<DocInfo[]>;
  activeId: Signal<string | null>;
  open: Kernel['documents']['open'];
  unlock: Kernel['documents']['unlock'];
  close: Kernel['documents']['close'];
  setActive: Kernel['documents']['setActive'];
  move: Kernel['documents']['move'];
  swap: Kernel['documents']['swap'];
  download: Kernel['documents']['download'];
  downloadLayer: Kernel['documents']['downloadLayer'];
}

export function injectDocuments(): EpdfDocuments {
  const host = injectKernelHost();
  return {
    docs: host.value((k) => k.documents.list(), docInfoListEquals),
    activeId: host.value((k) => k.documents.activeId()),
    open: (input, options) => host.kernel.documents.open(input, options),
    unlock: (id, input) => host.kernel.documents.unlock(id, input),
    close: (id) => host.kernel.documents.close(id),
    setActive: (id) => host.kernel.documents.setActive(id),
    move: (id, toIndex) => host.kernel.documents.move(id, toIndex),
    swap: (a, b) => host.kernel.documents.swap(a, b),
    download: (id, opts) => host.kernel.documents.download(id, opts),
    downloadLayer: (id) => host.kernel.documents.downloadLayer(id),
  };
}
