/**
 * The annotations an action can live on, of both read families: a page's
 * annotations (`doc.annotations`, `doc.annotate.read`) and its widgets, which
 * come with the form (`doc.forms.list()`, `doc.forms.read`). Each family is
 * read only when the session may read it, so a fill-only session still finds
 * its widgets' actions.
 */
import {
  annotationKey,
  type Annotation,
  type AnnotationRef,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import type { ActionsContext } from './context';

/** Every annotation of a page the session may read: its annotations, then its widgets. */
export async function readPageAnnotations(
  ctx: ActionsContext,
  page: PageRef,
  read: <T>(task: Promise<T>) => Promise<T> = (task) => task,
): Promise<Annotation[]> {
  const [annotations, widgets] = await Promise.all([
    ctx.allows('doc.annotate.read')
      ? read(ctx.doc.page(page).annotations.list()).then((list) => list.annotations)
      : Promise.resolve([]),
    ctx.allows('doc.forms.read')
      ? read(ctx.doc.forms.list()).then((form) =>
          form.widgets.filter((widget) => widget.page.objectNumber === page.objectNumber),
        )
      : Promise.resolve([]),
  ]);
  return [...annotations, ...widgets];
}

/**
 * The annotation `ref` names, of either family, or `null` when the session
 * can't see it: the form's widgets first (most actions a viewer runs are a
 * field's), then the page's annotations.
 */
export async function readAnnotation(
  ctx: ActionsContext,
  ref: AnnotationRef,
  read: <T>(task: Promise<T>) => Promise<T> = (task) => task,
): Promise<Annotation | null> {
  const key = annotationKey(ref);
  const matches = (candidate: Annotation) => annotationKey(candidate.ref) === key;
  if (ctx.allows('doc.forms.read')) {
    const widget = (await read(ctx.doc.forms.list())).widgets.find(matches);
    if (widget) return widget;
  }
  if (!ctx.allows('doc.annotate.read')) return null;
  return (await read(ctx.doc.page(ref.page).annotations.list())).annotations.find(matches) ?? null;
}
