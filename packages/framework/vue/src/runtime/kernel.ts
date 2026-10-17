/**
 * The kernel as Vue reads it. `<Viewer>` provides one {@link ViewerBinding}:
 * the kernel and a `track()` that makes a computed depend on the kernel's one
 * change stream. Every reader in the package is a computed over it
 * ({@link useKernelValue}), cached by an equality, so a component updates only
 * when the value it reads changed. `<DocumentScope>` provides the document a
 * subtree talks to.
 */
import { computed, inject, provide, toValue } from 'vue';
import type { InjectionKey, MaybeRefOrGetter, Ref } from 'vue';
import type { Kernel } from '@embedpdf/core';

/** What `<Viewer>` gives the components inside it. */
export interface ViewerBinding {
  /** The kernel, from the moment `<Viewer>` creates it; null before that. */
  readonly kernel: Kernel | null;
  /** Read inside a computed: the computed runs again on every change the kernel announces. */
  track(): void;
}

const ViewerKey: InjectionKey<ViewerBinding> = Symbol('embedpdf viewer');
const DocumentScopeKey: InjectionKey<Readonly<Ref<string | null>>> = Symbol(
  'embedpdf document scope',
);

/** Installed by `<Viewer>`, not by app code. */
export function provideViewer(binding: ViewerBinding): void {
  provide(ViewerKey, binding);
}

/** The binding of the nearest `<Viewer>`, with its kernel. */
export function useViewerBinding(): ViewerBinding & { readonly kernel: Kernel } {
  const binding = inject(ViewerKey, null);
  if (!binding?.kernel) {
    // The usual cause in Vue: a composable called in the component that renders
    // <Viewer>, which can't inject what its own child provides.
    throw new Error(
      'No <Viewer> above this component: EmbedPDF composables work in components rendered ' +
        'inside <Viewer>, not in the component that renders it.',
    );
  }
  return binding as ViewerBinding & { readonly kernel: Kernel };
}

/** The kernel of the nearest `<Viewer>`. */
export function useKernel(): Kernel {
  return useViewerBinding().kernel;
}

/**
 * A value derived from the kernel, as a ref. `select` runs again on every
 * kernel change and on a change to any ref it reads; the ref keeps its value
 * while `isEqual` says the new one is the same, so nothing that reads it
 * updates.
 */
export function useKernelValue<Value>(
  select: (kernel: Kernel) => Value,
  isEqual: (left: Value, right: Value) => boolean = Object.is,
): Readonly<Ref<Value>> {
  const { kernel, track } = useViewerBinding();
  // `previous` is undefined only on the first run, which has nothing to keep.
  return computed((previous: Value | undefined) => {
    track();
    const next = select(kernel);
    return previous !== undefined && isEqual(previous, next) ? previous : next;
  });
}

const NO_SCOPE = computed((): string | null => null);

/** Installed by `<DocumentScope>`: the document the subtree talks to. */
export function provideDocumentScope(id: MaybeRefOrGetter<string | null>): void {
  provide(
    DocumentScopeKey,
    computed(() => toValue(id)),
  );
}

/**
 * The document the nearest `<DocumentScope>` binds this subtree to, or null
 * when it follows the active document. For readers that pass it to
 * `kernel.tryCapability`; UI that needs the id itself uses {@link useDocumentId}.
 */
export function useDocumentScope(): Readonly<Ref<string | null>> {
  return inject(DocumentScopeKey, NO_SCOPE);
}

/** The active document's id, or null with none open. */
export function useActiveDocumentId(): Readonly<Ref<string | null>> {
  return useKernelValue((kernel) => kernel.documents.getActiveId());
}

/** The document id for this subtree: the nearest `<DocumentScope>`, else the active document. */
export function useDocumentId(): Readonly<Ref<string | null>> {
  const scope = useDocumentScope();
  const active = useActiveDocumentId();
  return computed(() => scope.value ?? active.value);
}
