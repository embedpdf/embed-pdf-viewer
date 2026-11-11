import {
  EngineError,
  EngineErrorCode,
  fieldMatches,
  pageFormSnapshotOf,
  type AnnotationActor,
  type AnnotationRef,
  type BundleLimits,
  type FormCopyResult,
  type FormFieldRef,
  type PageRef,
  type PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import { planFormCopy } from '@embedpdf/engine-core/validation';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { FormReader } from './FormReader';
import { createPlannedFields } from './internal/createPlannedFields';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import type { FontRegistrar } from '../fonts/FontRegistrar';
import { visibleBoxReader } from '../pages/PagesReader';
import { assertCopyWithinLimit } from '../transfer/copyLimits';

export interface FormCopyRequest {
  readonly fields: readonly FormFieldRef[];
  /** The widgets to copy, when it isn't every widget of the fields. */
  readonly widgets?: readonly AnnotationRef[];
  /** The page the copied widgets go on; each on its own page when absent. */
  readonly page?: PageRef;
  /** How far each copied widget moves, in page points from the top-left. */
  readonly offset?: { readonly x: number; readonly y: number };
  /** Whether each copy gets its source's value. */
  readonly values: boolean;
  /** For each field in order: its copy's object number, then one for each widget copied. */
  readonly objectNumbers?: readonly number[];
  /** The session's identity: who makes each copy, and fills it in when it gets a value. */
  readonly actor: AnnotationActor;
  /** Whether scripts, submits and links are kept (`doc.forms.script`); without it they're left out. */
  readonly mayScript: boolean;
  /**
   * The group a copy goes in, given the one its source is in (if any):
   * checked by the caller, which refuses one it may not set.
   */
  readonly groupOf: (groupId: string | undefined) => string | undefined;
  /** What the copy may carry: `fields` names as many fields as a bundle holds items. */
  readonly limits: BundleLimits;
}

/**
 * `doc.forms.copy`: new fields from fields of this document, created as one
 * change. The form is read as `list()` reads it and measured from the
 * top-left of each page, `planFormCopy` works out the copies and what to
 * leave out, and they are written as a design import's fields are
 * (`createPlannedFields`). So everything that is left out is decided before
 * the first write. A widget is drawn from its data: nothing is read from a
 * source but what `list()` returns.
 *
 * `fields` names at most `limits.items` fields; more is refused with
 * `PayloadTooLarge` before the form is read. A widget carries no bytes, so
 * the other bundle limits have nothing to count.
 */
export class FormCopier {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
    /** This thread's font registry, for the widget rows. */
    private readonly fonts?: FontRegistrar,
  ) {}

  copy(request: FormCopyRequest, signal: AbortSignal): FormCopyResult<PdfCoordinates> {
    throwIfAborted(signal);
    // Counted as asked, before anything is read.
    assertCopyWithinLimit(request.limits, 'items', request.fields.length);
    // A page the document doesn't have refuses the copy before anything is read.
    if (request.page) this.session.resolvePageRef(request.page);
    const form = pageFormSnapshotOf(
      new FormReader(this.runtime, this.session, this.fonts).snapshot(signal),
      visibleBoxReader(this.runtime, this.session),
    );
    const plan = planFormCopy({
      form,
      fields: request.fields,
      ...(request.widgets ? { widgets: request.widgets } : {}),
      placement: {
        ...(request.page ? { page: request.page } : {}),
        ...(request.offset ? { offset: request.offset } : {}),
      },
      values: request.values,
      mayScript: request.mayScript,
    });

    const { objectNumbers } = request;
    const needed = plan.creates.reduce((count, create) => count + 1 + create.widgets.length, 0);
    if (objectNumbers && objectNumbers.length !== needed) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `copy: objectNumbers names ${objectNumbers.length} objects of ${needed}`,
        { details: { field: 'objectNumbers' } },
      );
    }
    let taken = 0;
    const made = createPlannedFields(
      this.runtime,
      this.session,
      this.fonts,
      plan.creates.map((create) => {
        const count = 1 + create.widgets.length;
        const numbers = objectNumbers?.slice(taken, taken + count);
        taken += count;
        return { ...create, ...(numbers ? { objectNumbers: numbers } : {}) };
      }),
      plan.calculationOrder,
      { actor: request.actor, groupOf: request.groupOf, signal },
    );
    return {
      ...made,
      refMap: plan.creates.map((create, at) => ({
        from: form.fields.find((field) => fieldMatches(field, request.fields[create.source]!))!.ref,
        to: made.fields[at]!.ref,
      })),
      dropped: [...plan.dropped],
    };
  }
}
