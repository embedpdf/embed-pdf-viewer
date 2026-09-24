import { z } from 'zod';
import type { IsoDateTime } from '../dto/IsoDateTime';
import { IsoDateTimeSchema } from '../dto/IsoDateTime.schema';

/**
 * One resolved entry of a form submission. The viewer resolved it with the
 * ISO 32000-2 Table 239/240 semantics already applied (Include/Exclude +
 * descendants, the unconditional NoExport veto, push-button and
 * unsupported-value exclusion), so the home never re-derives selection.
 * `value === null` is a name-only entry (the IncludeNoValueFields shape);
 * `string[]` is a multi-select list box.
 */
export interface FormSubmissionEntry {
  name: string;
  value: string | string[] | null;
}

/**
 * What a submit-capable document home receives — the resolved dataset plus
 * the document's declared intent as metadata. The stack never fetches the
 * declared URL itself (a PDF-controlled URL reaching a server-side fetcher
 * is the SSRF class this contract exists to prevent); the home stores the
 * intent so its consumers can decide what to honor.
 *
 * Deliberately absent: identity. The home derives who submitted from its
 * own verified session (the JWT it authenticated) — a client-supplied
 * identity would be a spoofing surface.
 */
export interface FormSubmissionRequest {
  entries: FormSubmissionEntry[];
  /** The document's declared routing wish, verbatim (metadata, not orders).
   *  `url` is null for scripted submits that named no target. */
  intent: {
    url: string | null;
    format: 'fdf' | 'html' | 'xfdf' | 'pdf';
    method: 'post' | 'get';
    /** Raw ISO Table 240 flag word (0 for scripted submits without one). */
    flagsRaw: number;
    /** /CharSet (PDF 2.0), extracted but never encoded by this stack. */
    charSet?: string;
  };
  /** How the submission was triggered — the viewer-derived origin axis. */
  origin: 'user' | 'hover' | 'lifecycle';
  /** The client's clock when it sent the submission. Informational — the
   *  home stamps its own authoritative `receivedAt`. */
  sentAt: IsoDateTime;
}

/** The home's acknowledgment: the stored submission's durable identity. */
export interface FormSubmissionReceipt {
  submissionId: string;
  /** The home's clock. */
  receivedAt: IsoDateTime;
}

export const FormSubmissionEntrySchema: z.ZodType<FormSubmissionEntry> = z.object({
  name: z.string(),
  value: z.union([z.string(), z.array(z.string()), z.null()]),
});

export const FormSubmissionRequestSchema: z.ZodType<FormSubmissionRequest> = z.object({
  entries: z.array(FormSubmissionEntrySchema),
  intent: z.object({
    url: z.string().nullable(),
    format: z.enum(['fdf', 'html', 'xfdf', 'pdf']),
    method: z.enum(['post', 'get']),
    flagsRaw: z.number().int().nonnegative(),
    charSet: z.string().optional(),
  }),
  origin: z.enum(['user', 'hover', 'lifecycle']),
  sentAt: IsoDateTimeSchema,
}) as unknown as z.ZodType<FormSubmissionRequest>;

export const FormSubmissionReceiptSchema: z.ZodType<FormSubmissionReceipt> = z.object({
  submissionId: z.string().min(1),
  receivedAt: IsoDateTimeSchema,
});
