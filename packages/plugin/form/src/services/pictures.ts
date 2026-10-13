/**
 * The engine's pictures of each page's widgets, through the render plugin's
 * one door. The form layer draws them, and the annotation plugin draws the
 * widgets it borrows from the same ones (design mode), so switching modes
 * fetches nothing. A page's pictures depend on its widgets' picture versions
 * (the mirror's) and nothing else: a checkbox that only switches its state
 * fetches nothing.
 */
import { memoByKey, type Mirror } from '@embedpdf/core';
import type { AnnotationRef, PageRef } from '@embedpdf/engine-core/runtime';
import type { AppearanceItem, AppearancePicture } from '@embedpdf/plugin-render/contract/host';

import { pictureVersionOf, type FieldIndex } from '../model';
import type { FormSiblings } from './siblings';

export interface WidgetPictures {
  /** What the page's pictures depend on, `5@2|6@7`: a new value means new pictures. */
  epoch(page: PageRef): string;
  /** Every picture of the page's widgets, at rest, in every state, each with its widget's version. */
  render(page: PageRef, scale: number, signal?: AbortSignal): Promise<readonly AppearancePicture[]>;
  /** The widget's confirmed picture version. */
  versionOf(widget: AnnotationRef): number;
}

const NO_PICTURES: readonly AppearancePicture[] = Object.freeze([]);

export function createWidgetPictures(
  fields: Mirror<FieldIndex>,
  { render }: Pick<FormSiblings, 'render'>,
): WidgetPictures {
  /** The page's widgets, as the engine confirmed them, each at its picture version. */
  const itemsOn = memoByKey(
    (_pageObjectNumber: number) => [fields.get()] as const,
    (pageObjectNumber, index): readonly AppearanceItem[] =>
      (index.snapshot?.widgets ?? []).flatMap((row) =>
        row.page.objectNumber === pageObjectNumber && row.ref.kind === 'objectNumber'
          ? [{ ref: row.ref, version: pictureVersionOf(index, row.ref.objectNumber) }]
          : [],
      ),
  );
  const epochOn = memoByKey(
    (pageObjectNumber: number) => [itemsOn(pageObjectNumber)] as const,
    (_pageObjectNumber, items) =>
      items
        .map(
          ({ ref, version }) => `${ref.kind === 'objectNumber' ? ref.objectNumber : ''}@${version}`,
        )
        .sort()
        .join('|'),
  );
  return {
    epoch: (page) => epochOn(page.objectNumber),
    render: (page, scale, signal) => {
      const renderer = render();
      return renderer
        ? renderer.renderAppearances(page, {
            family: 'widgets',
            scale,
            items: itemsOn(page.objectNumber),
            ...(signal ? { signal } : {}),
          })
        : Promise.resolve(NO_PICTURES);
    },
    versionOf: (widget) =>
      widget.kind === 'objectNumber' ? pictureVersionOf(fields.get(), widget.objectNumber) : 0,
  };
}
