/**
 * The kernel as Svelte sees it, and the two contexts every reader starts from.
 *
 * The kernel has one change stream (`kernel.subscribe`). {@link KernelBinding} turns it into one
 * signal: a version that moves on every change. A reader reads that version inside a `$derived`,
 * so it computes again after any change and passes a value on only when it differs. The binding
 * subscribes for the kernel's whole life, so a reader works the same inside a template, an effect
 * or an event handler.
 *
 * `<Viewer>` puts the binding in context; `<DocumentScope>` puts the document a subtree talks to.
 */
import { getContext, hasContext, setContext, untrack } from 'svelte';
import type { Kernel } from '@embedpdf/core';

export class KernelBinding {
  readonly kernel: Kernel;
  #version = $state(0);
  readonly #unsubscribe: () => void;

  constructor(kernel: Kernel) {
    this.kernel = kernel;
    // `untrack`: a change can be announced while a reaction runs (a verb called from an effect),
    // and the version is a counter nobody reads to decide what to write.
    this.#unsubscribe = kernel.subscribe(() => untrack(() => this.#version++));
  }

  /** Read inside a `$derived` or an effect to run it again after every kernel change. */
  track(): void {
    void this.#version;
  }

  /** Stop following the kernel; the viewer calls it when it unmounts. */
  dispose(): void {
    this.#unsubscribe();
  }
}

const KERNEL = Symbol('embedpdf.kernel');
const DOCUMENT_SCOPE = Symbol('embedpdf.document-scope');

/** What `<Viewer>` provides: the binding, once its kernel exists. */
export interface KernelHolder {
  readonly binding: KernelBinding | null;
}

/** For `<Viewer>`: provide the kernel to everything inside it. */
export function setKernelHolder(holder: KernelHolder): void {
  setContext(KERNEL, holder);
}

/**
 * The binding of the nearest `<Viewer>`. Everything inside a viewer is created after its kernel,
 * so the binding is there whenever a component inside asks.
 */
export function useKernelBinding(): KernelBinding {
  // Untracked: the binding never changes for a component's lifetime, so nothing re-runs on it.
  const binding = hasContext(KERNEL)
    ? untrack(() => getContext<KernelHolder>(KERNEL).binding)
    : null;
  if (!binding) throw new Error('[embedpdf] This must be used inside <Viewer>.');
  return binding;
}

/** The kernel of the nearest `<Viewer>`: for code that needs it whole (`onReady` gives it too). */
export function useKernel(): Kernel {
  return useKernelBinding().kernel;
}

/** For `<DocumentScope>`: bind a subtree to the document `id()` names. */
export function setDocumentScope(id: () => string): void {
  setContext(DOCUMENT_SCOPE, id);
}

const ACTIVE: () => null = () => null;

/**
 * The document the nearest `<DocumentScope>` names, as a function readers call each time (so a
 * changed `id` reaches them), or one that answers null: follow the active document.
 */
export function documentScopeOf(): () => string | null {
  return hasContext(DOCUMENT_SCOPE) ? getContext<() => string>(DOCUMENT_SCOPE) : ACTIVE;
}
