/**
 * What a field is for, as the plugin reads it. A field's `purpose` is a word in the PDF, and the
 * engine reads nothing into it; this is where the well-known words get their meaning: the name
 * an empty field shows (its placeholder, in the viewer's language through the i18n plugin when
 * it is there), and the value the session already has for it (`prefill()`): the identity's
 * name, email address, organization and title, and today's date for the day of signing. Any
 * other word is kept and read back as it is: it has no name here, and no value.
 */
import { memo } from '@embedpdf/core';
import { formatDate } from '@embedpdf/core-acrojs';
import type { FormField, Identity } from '@embedpdf/engine-core/runtime';
import { I18nToken } from '@embedpdf/plugin-i18n/contract';

import { WELL_KNOWN_PURPOSES, type FormPurpose, type WellKnownPurpose } from '../contract';
import type { FormContext } from './context';

/** Each well-known purpose's name in English: the fallback of `form.purposes.<id>`. */
const LABELS: Readonly<Record<WellKnownPurpose, string>> = {
  name: 'Name',
  email: 'Email',
  organization: 'Organization',
  'organization-title': 'Title',
  'date-signed': 'Date signed',
  signature: 'Signature',
  initials: 'Initials',
};

/** What the session's identity says for a purpose; the others have no value to prefill. */
const IDENTITY_VALUES: Readonly<
  Partial<Record<WellKnownPurpose, (identity: Identity) => string | undefined>>
> = {
  name: (identity) => identity.displayName,
  email: (identity) => identity.email,
  organization: (identity) => identity.organization,
  'organization-title': (identity) => identity.title,
};

const NO_IDENTITY: Identity = Object.freeze({});

/** How the day of signing is written in a field whose format has no date pattern of its own. */
const SIGNED_DATE_PATTERN = 'yyyy-mm-dd';

/** The date pattern a field writes the day of signing in: its own date format's, else ISO's. */
const signedDatePatternOf = (field: FormField): string => {
  const format = 'format' in field ? field.format : null;
  return format?.kind === 'date' ? format.pattern : SIGNED_DATE_PATTERN;
};

const isWellKnown = (purpose: string): purpose is WellKnownPurpose =>
  (WELL_KNOWN_PURPOSES as readonly string[]).includes(purpose);

export interface FormPurposes {
  /** The well-known purposes, each with its label. The same array while nothing changes. */
  list(): readonly FormPurpose[];
  /** A purpose's label, or `null` for no purpose and for a word the plugin doesn't know. */
  labelOf(purpose: string | null): string | null;
  /**
   * What `prefill()` writes into a field: the text; `null` when its purpose has a source and
   * the source has nothing now; `undefined` when its purpose has no source at all.
   */
  valueFor(field: FormField): string | null | undefined;
  /** What the day of signing tells the person whose date it is, in the viewer's language. */
  signingDateHint(): string;
}

/** The day of signing's hint in English: the fallback of `form.hints.date-signed`. */
const SIGNING_DATE_HINT = 'Filled in when you sign';

export function createPurposes(ctx: FormContext): FormPurposes {
  const i18n = ctx.tryGet(I18nToken);

  const list = memo(
    () => [i18n?.getTranslator() ?? null] as const,
    (translate): readonly FormPurpose[] =>
      Object.freeze(
        WELL_KNOWN_PURPOSES.map((id) =>
          Object.freeze({
            id,
            label: translate?.(`form.purposes.${id}`, { fallback: LABELS[id] }) ?? LABELS[id],
          }),
        ),
      ),
  );

  const signingDateHint = memo(
    () => [i18n?.getTranslator() ?? null] as const,
    (translate): string =>
      translate?.('form.hints.date-signed', { fallback: SIGNING_DATE_HINT }) ?? SIGNING_DATE_HINT,
  );

  const labels = memo(
    () => [list()] as const,
    (purposes): ReadonlyMap<string, string> =>
      new Map(purposes.map((purpose) => [purpose.id, purpose.label])),
  );

  const valueFor = (field: FormField): string | null | undefined => {
    if (field.purpose === null || !isWellKnown(field.purpose)) return undefined;
    // The day of signing is today where the person is, as the field writes a date.
    if (field.purpose === 'date-signed') {
      return formatDate(ctx.clock.today(), signedDatePatternOf(field));
    }
    const read = IDENTITY_VALUES[field.purpose];
    return read ? (read(ctx.doc.security.identity ?? NO_IDENTITY) ?? null) : undefined;
  };

  return {
    list,
    labelOf: (purpose) => (purpose === null ? null : (labels().get(purpose) ?? null)),
    valueFor,
    signingDateHint,
  };
}
