import { z } from 'zod';

export const POSITIVE_FEEDBACK_REASONS = ['clear', 'example_worked', 'found_answer'] as const;

export const NEGATIVE_FEEDBACK_REASONS = [
  'missing_information',
  'example_failed',
  'unclear',
  'outdated',
  'could_not_find',
] as const;

export const FEEDBACK_REASONS = [
  ...POSITIVE_FEEDBACK_REASONS,
  ...NEGATIVE_FEEDBACK_REASONS,
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECTION_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/i;
const POSITIVE_REASON_SET = new Set<string>(POSITIVE_FEEDBACK_REASONS);
const NEGATIVE_REASON_SET = new Set<string>(NEGATIVE_FEEDBACK_REASONS);

const feedbackReasonSchema = z.enum(FEEDBACK_REASONS);

const sectionIdSchema = z
  .union([z.string().trim().max(128, 'Invalid section id.'), z.null()])
  .refine(
    (value) => value === null || value === '' || SECTION_PATTERN.test(value),
    'Invalid section id.',
  )
  .transform((value) => value || null);

const commentSchema = z
  .union([
    z.string().trim().max(1000, 'Feedback comments are limited to 1,000 characters.'),
    z.null(),
  ])
  .transform((value) => value || null);

export const feedbackPayloadSchema = z
  .object({
    id: z.string().regex(UUID_PATTERN, 'Invalid feedback id.'),
    site: z.enum(['embedpdf', 'cloudpdf'], { error: 'Invalid documentation site.' }),
    path: z
      .string({ error: 'Invalid documentation path.' })
      .max(512, 'Invalid documentation path.')
      .refine(
        (path) => path.startsWith('/docs') && !path.includes('?') && !path.includes('#'),
        'Invalid documentation path.',
      ),
    sectionId: sectionIdSchema,
    helpful: z.boolean({ error: 'A helpfulness choice is required.' }),
    reasons: z
      .array(feedbackReasonSchema, { error: 'Invalid feedback reason.' })
      .max(3, 'Choose no more than three reasons.')
      .transform((reasons) => [...new Set(reasons)]),
    comment: commentSchema,
    company: z.string().optional(),
  })
  .superRefine((feedback, context) => {
    const allowedReasons = feedback.helpful ? POSITIVE_REASON_SET : NEGATIVE_REASON_SET;

    if (feedback.reasons.some((reason) => !allowedReasons.has(reason))) {
      context.addIssue({
        code: 'custom',
        path: ['reasons'],
        message: 'Invalid feedback reason.',
      });
    }
  })
  .transform(({ company: _company, ...feedback }) => feedback);

export type FeedbackReason = z.infer<typeof feedbackReasonSchema>;
export type FeedbackSite = z.input<typeof feedbackPayloadSchema>['site'];
export type FeedbackPayload = z.input<typeof feedbackPayloadSchema>;
export type ValidatedFeedback = z.output<typeof feedbackPayloadSchema>;

export type FeedbackValidationResult =
  | { ok: true; value: ValidatedFeedback }
  | { ok: false; kind: 'invalid'; message: string }
  | { ok: false; kind: 'bot'; message: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function frameworkFromDocsPath(path: string): string | null {
  const match = path.match(/^\/docs\/headless\/(react|vue|svelte|angular)(?:\/|$)/);
  return match?.[1] ?? null;
}

export function validateFeedbackPayload(input: unknown): FeedbackValidationResult {
  if (!isPlainObject(input)) {
    return { ok: false, kind: 'invalid', message: 'Expected a JSON object.' };
  }

  if (typeof input.company === 'string' && input.company.trim() !== '') {
    return { ok: false, kind: 'bot', message: 'Submission accepted.' };
  }

  const result = feedbackPayloadSchema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      kind: 'invalid',
      message: result.error.issues[0]?.message ?? 'Invalid feedback.',
    };
  }

  return { ok: true, value: result.data };
}
