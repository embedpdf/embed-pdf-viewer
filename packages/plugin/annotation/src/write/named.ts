import { generateUuid, type AnnotationDraft } from '@embedpdf/engine-core/runtime';

/**
 * The draft with an /NM: the caller's own, or a fresh one. Every create this
 * plugin sends to the viewed document goes through here, so every annotation
 * it creates has a name, as Acrobat's do: the key a new record's confirmation
 * is matched by (services/record-identity.ts), and the one review tools and XFDF
 * round-trips use.
 */
export const named = <Draft extends AnnotationDraft>(draft: Draft): Draft & { nm: string } =>
  draft.nm ? (draft as Draft & { nm: string }) : { ...draft, nm: generateUuid() };
