/**
 * What a share link asks its visitors (`visitorIdentity` on the link), and
 * how an exchange settles their answers. The answers are the server's from
 * then on: given once, stored with the visitor, and put into every token
 * issued for them. A visitor never changes an answer they gave; one who
 * mistyped starts over as a new visitor.
 */

/** The fields a link can ask, as the token's `identity` names them. `userId` is never asked. */
export const VISITOR_IDENTITY_FIELDS = [
  'displayName',
  'email',
  'title',
  'organization',
  'organizationalUnit',
] as const;
export type VisitorIdentityField = (typeof VISITOR_IDENTITY_FIELDS)[number];

export type VisitorAnswers = Partial<Record<VisitorIdentityField, string>>;

export interface VisitorIdentityConfig {
  fields: Partial<Record<VisitorIdentityField, 'required' | 'optional'>>;
  /** Ask when they open (a lead gate), or before their first change (a review link). */
  ask: 'on-open' | 'before-first-change';
  /** Shown with the questions: why they're asked. */
  purpose?: string;
  privacyUrl?: string;
}

/**
 * What a visitor is asked: the details of `VisitorIdentityRequired`, at the
 * exchange and on a write refused while their identity is pending.
 */
export interface VisitorIdentityRequest {
  fields: VisitorIdentityConfig['fields'];
  /** Required fields not answered yet. */
  missing: VisitorIdentityField[];
  /** Answers given this time that can't be taken (an email that isn't one, too long). */
  invalid: VisitorIdentityField[];
  purpose?: string;
  privacyUrl?: string;
}

const MAX_ANSWER = 256;
const MAX_EMAIL = 254;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SettledIdentity {
  /** The visitor's answers after this exchange: what the token carries. */
  answers: VisitorAnswers;
  /** Answers given this time for fields not answered before: what to store. */
  added: VisitorAnswers;
  /** What the visitor still has to answer: `null` when nothing. */
  request: VisitorIdentityRequest | null;
}

/**
 * Settle a visitor's identity at an exchange. `stored` answers stand and are
 * never replaced; `given` fills the asked fields not answered yet, and
 * answers to fields the link doesn't ask are ignored. Whatever is required
 * and still unanswered, or given and not valid, comes back as `request`.
 */
export function settleVisitorIdentity(
  config: VisitorIdentityConfig | null,
  stored: VisitorAnswers,
  given: Record<string, unknown> | undefined,
): SettledIdentity {
  const answers: VisitorAnswers = { ...stored };
  const added: VisitorAnswers = {};
  if (!config) return { answers, added, request: null };
  const invalid: VisitorIdentityField[] = [];
  for (const field of VISITOR_IDENTITY_FIELDS) {
    if (!config.fields[field] || answers[field] !== undefined) continue;
    const raw = given?.[field];
    if (raw === undefined || raw === null) continue;
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value.length === 0) continue;
    if (!validAnswer(field, value)) {
      invalid.push(field);
      continue;
    }
    answers[field] = value;
    added[field] = value;
  }
  const missing = VISITOR_IDENTITY_FIELDS.filter(
    (field) => config.fields[field] === 'required' && answers[field] === undefined,
  );
  if (missing.length === 0 && invalid.length === 0) return { answers, added, request: null };
  return {
    answers,
    added,
    request: {
      fields: config.fields,
      missing,
      invalid,
      ...(config.purpose !== undefined ? { purpose: config.purpose } : {}),
      ...(config.privacyUrl !== undefined ? { privacyUrl: config.privacyUrl } : {}),
    },
  };
}

function validAnswer(field: VisitorIdentityField, value: string): boolean {
  if (field === 'email') return value.length <= MAX_EMAIL && EMAIL.test(value);
  return value.length <= MAX_ANSWER;
}
