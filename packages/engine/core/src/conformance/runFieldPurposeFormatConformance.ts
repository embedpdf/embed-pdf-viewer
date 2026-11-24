import { pdfOf } from './pdfOf';
import type { ConformanceTestRunner } from './runMetadataConformance';
import type { Identity } from '../auth/scope/types';
import type { FieldScriptEvent } from '../dto/PdfAction';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { FormFieldDraft } from '../forms/draft';
import type { FormField } from '../forms/field';
import type { FormFieldFormat, FormFieldFormatWritable } from '../forms/format';
import type { FormFieldPatch } from '../forms/patch';
import type { FormFieldRef } from '../identity/FormFieldRef';
import { toPageRef } from '../identity/PageRef';

/**
 * Two facts about a form field, the same on every engine:
 *   - its purpose: what its value means. Any field has one or none, kept in
 *     the field's `/EMBD_Metadata /Purpose`; the engine reads nothing into it;
 *   - its format: the shape a text field's or a dropdown's value has, read
 *     from its format script as Acrobat decides it, and written as the
 *     format and keystroke scripts Acrobat writes: a date's two take its
 *     pattern, and a time's keystroke script names a standard time pattern
 *     by number, the only keystroke call Acrobat has for a time.
 *
 * Both are form design (`doc.forms.modify`): a format takes no
 * `doc.forms.script`, since the engine composes its scripts from a checked
 * pattern. Both follow a field through a save, an undo, a copy and an
 * import.
 *
 * It runs on {@link FIELD_PURPOSE_FORMAT_PDF}.
 */

const DATE_FORMAT = 'AFDate_FormatEx("m/d/yy");';
const DATE_KEYSTROKE = 'AFDate_KeystrokeEx("m/d/yy");';
const NUMBER_FORMAT = 'AFNumber_Format(2, 0, 0, 0, "", true);';
const NUMBER_KEYSTROKE = 'AFNumber_Keystroke(2, 0, 0, 0, "", true);';

/** A field of the fixture: its name, what makes it its kind, its scripts and its private entry. */
interface FixtureField {
  readonly name: string;
  /** `/FT` and what goes with it; a text field when left out. */
  readonly family?: string;
  /** Its format script (`/AA /F`), as it stands in the file. */
  readonly format?: string;
  /** Its keystroke script (`/AA /K`). */
  readonly keystroke?: string;
  /** A script run after the format script (`/Next`). */
  readonly next?: string;
  /** An action run after the format script that is no script, as its dictionary. */
  readonly nextAction?: string;
  /** Its `/EMBD_Metadata`, without the schema version. */
  readonly metadata?: string;
}

const DROPDOWN = '/FT /Ch /Ff 131072 /Opt [(2026-03-05) (2026-03-06)]';
const LIST = '/FT /Ch /Opt [(a) (b)]';

/**
 * The fixture's fields. The first eight are the ones Acrobat was asked
 * about, each clicked to see whether it offers its date picker: it does for
 * the four whose format script is one of its date calls (1, 2, 4 and 6),
 * whatever the name and with or without a keystroke script.
 */
const FIXTURE_FIELDS: readonly FixtureField[] = [
  { name: 'Date1_af_date', format: DATE_FORMAT, keystroke: DATE_KEYSTROKE },
  { name: 'plain_one', format: DATE_FORMAT, keystroke: DATE_KEYSTROKE },
  { name: 'Date2_af_date' },
  { name: 'plain_two', format: DATE_FORMAT },
  { name: 'plain_three', keystroke: DATE_KEYSTROKE },
  { name: 'plain_four', format: 'AFDate_Format(0);', keystroke: 'AFDate_Keystroke(0);' },
  { name: 'plain_five', format: NUMBER_FORMAT, keystroke: NUMBER_KEYSTROKE },
  { name: 'plain_six' },
  // Times, by pattern and by number.
  { name: 'time_pattern', format: 'AFTime_FormatEx("HH:MM");', keystroke: 'AFTime_Keystroke(0);' },
  { name: 'time_numbered', format: 'AFTime_Format(1);', keystroke: 'AFTime_Keystroke(1);' },
  // A date that carries a time, as two of Acrobat's own date patterns do.
  { name: 'date_with_time', format: 'AFDate_Format(13);', keystroke: 'AFDate_Keystroke(13);' },
  // The call in other wordings: single quotes, spaces around it, no semicolon.
  { name: 'single_quotes', format: "  AFDate_FormatEx( 'dd.mm.yyyy' )  " },
  // What must not read as a date: more code than the one call, a pattern the
  // engine doesn't take, a number Acrobat's list doesn't have, a script after it.
  { name: 'contains_call', format: `var seen = true; ${DATE_FORMAT}` },
  { name: 'two_calls', format: `${DATE_FORMAT}${DATE_FORMAT}` },
  { name: 'weekday', format: 'AFDate_FormatEx("dddd, mmmm d, yyyy");' },
  { name: 'unseparated', format: 'AFDate_FormatEx("yyyymmdd");' },
  { name: 'dotted_time', format: 'AFTime_FormatEx("HH.MM");' },
  // A pattern of the other kind: a date call with a time alone, a time call with a date in it.
  { name: 'date_call_time', format: 'AFDate_FormatEx("HH:MM");' },
  { name: 'time_call_date', format: 'AFTime_FormatEx("m/d/yy HH:MM");' },
  { name: 'numbered_past', format: 'AFDate_Format(14);' },
  { name: 'chained', format: DATE_FORMAT, next: 'app.beep();' },
  // A date format whose keystroke script is code of its own.
  { name: 'own_keystroke', format: DATE_FORMAT, keystroke: 'event.rc = true;' },
  { name: 'dropdown_date', family: DROPDOWN, format: 'AFDate_FormatEx("yyyy-mm-dd");' },
  { name: 'list_with_script', family: LIST, format: DATE_FORMAT },
  // Purposes: one with a group beside it, one with space around it, one on a signature field.
  { name: 'full_name', metadata: '/GroupID (attendee) /Purpose (name)' },
  { name: 'spaced_purpose', metadata: '/Purpose ( name )' },
  { name: 'sign_here', family: '/FT /Sig', metadata: '/Purpose (signature)' },
  // A format script that goes on to a GoTo: actions no script write can make again.
  { name: 'goes_on', format: DATE_FORMAT, nextAction: '<< /S /GoTo /D [3 0 R /Fit] >>' },
];

/** The format each text field and dropdown of the fixture reads. */
const FIXTURE_FORMATS: Readonly<Record<string, FormFieldFormat | null>> = {
  Date1_af_date: { kind: 'date', pattern: 'm/d/yy' },
  plain_one: { kind: 'date', pattern: 'm/d/yy' },
  Date2_af_date: null,
  plain_two: { kind: 'date', pattern: 'm/d/yy' },
  plain_three: null,
  plain_four: { kind: 'date', pattern: 'm/d' },
  plain_five: { kind: 'other' },
  plain_six: null,
  time_pattern: { kind: 'time', pattern: 'HH:MM' },
  time_numbered: { kind: 'time', pattern: 'h:MM tt' },
  date_with_time: { kind: 'date', pattern: 'm/d/yy HH:MM' },
  single_quotes: { kind: 'date', pattern: 'dd.mm.yyyy' },
  contains_call: { kind: 'other' },
  two_calls: { kind: 'other' },
  weekday: { kind: 'other' },
  unseparated: { kind: 'other' },
  dotted_time: { kind: 'other' },
  date_call_time: { kind: 'other' },
  time_call_date: { kind: 'other' },
  numbered_past: { kind: 'other' },
  chained: { kind: 'other' },
  own_keystroke: { kind: 'date', pattern: 'm/d/yy' },
  dropdown_date: { kind: 'date', pattern: 'yyyy-mm-dd' },
  full_name: null,
  spaced_purpose: null,
  goes_on: { kind: 'other' },
};

/**
 * One page of fields that differ in their name, their format and keystroke
 * scripts and their `/EMBD_Metadata`: the eight text fields Acrobat's date
 * picker was tried on, the other wordings a format script comes in, the
 * scripts that must not read as a date, and three fields with a purpose.
 */
export const FIELD_PURPOSE_FORMAT_PDF = (() => {
  const text = (value: string) => `(${value.replace(/[\\()]/g, (character) => `\\${character}`)})`;
  const script = (code: string, next?: string, nextAction?: string) => {
    const after = next ? `<< /S /JavaScript /JS ${text(next)} >>` : nextAction;
    return `<< /S /JavaScript /JS ${text(code)}${after ? ` /Next ${after}` : ''} >>`;
  };
  const first = 4;
  const refs = FIXTURE_FIELDS.map((_, at) => `${first + at} 0 R`).join(' ');
  const fields = FIXTURE_FIELDS.map((field, at) => {
    const top = 770 - at * 27;
    const actions = [
      field.format ? `/F ${script(field.format, field.next, field.nextAction)}` : '',
      field.keystroke ? `/K ${script(field.keystroke)}` : '',
    ].filter(Boolean);
    return (
      `<< /Type /Annot /Subtype /Widget ${field.family ?? '/FT /Tx'} /T (${field.name}) ` +
      `/Rect [330 ${top - 24} 530 ${top}] /F 4 /P 3 0 R` +
      (actions.length > 0 ? ` /AA << ${actions.join(' ')} >>` : '') +
      (field.metadata ? ` /EMBD_Metadata << /SchemaVersion 1 ${field.metadata} >>` : '') +
      ' >>'
    );
  });
  return pdfOf([
    `<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [${refs}] /DA (/Helv 10 Tf 0 g) ` +
      '/DR << /Font << /Helv << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${first + fields.length} 0 R ` +
      `/Resources << >> /Annots [${refs}] >>`,
    ...fields,
    '<< /Length 0 >>\nstream\n\nendstream',
  ]);
})();

/** The tokens the suite opens the fixture with. */
export const FIELD_PURPOSE_FORMAT_TOKENS = {
  everything: ['*'],
  /** Designs the form, and may write no script. */
  designer: ['doc.open', 'doc.render', 'doc.download', 'doc.forms.modify'],
  /** Fills the form in. */
  filler: ['doc.open', 'doc.render', 'doc.forms.fill'],
  /** Reads the form. */
  reader: ['doc.open', 'doc.render', 'doc.forms.read'],
} as const satisfies Record<string, readonly string[]>;

export type FieldPurposeFormatToken = keyof typeof FIELD_PURPOSE_FORMAT_TOKENS;

export interface FieldPurposeFormatConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  /** Open a fresh copy of `bytes` (default {@link FIELD_PURPOSE_FORMAT_PDF}) with `scope`, acting for `identity`. */
  open: (
    engine: Engine,
    scope: readonly string[],
    identity: Identity,
    bytes?: Uint8Array,
  ) => Promise<DocumentHandle>;
}

const PAGE = toPageRef(3);
const named = (name: string): FormFieldRef => ({ kind: 'fqn', name });
const rect = (row: number) => ({ x: 40, y: 40 + row * 30, width: 200, height: 24 });

export function runFieldPurposeFormatConformance(
  runner: ConformanceTestRunner,
  options: FieldPurposeFormatConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`field purpose and format conformance: ${options.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await options.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const as = async (
      token: FieldPurposeFormatToken,
      body: (doc: DocumentHandle) => Promise<void>,
      bytes?: Uint8Array,
    ) => {
      const doc = await options.open(engine, FIELD_PURPOSE_FORMAT_TOKENS[token], {}, bytes);
      try {
        await body(doc);
      } finally {
        await doc.close();
      }
    };

    const refusal = (attempt: Promise<unknown>): Promise<unknown> =>
      attempt.then(
        () => null,
        (error: unknown) => error,
      );
    const codeOf = (error: unknown) =>
      EngineError.is(error) ? error.code : error === null ? 'resolved' : String(error);
    /** The code a write is refused with, or `'resolved'`. */
    const refused = async (attempt: Promise<unknown>) => codeOf(await refusal(attempt));

    /** A field's format; `undefined` for a kind that has none. */
    const formatOf = (field: FormField) => ('format' in field ? field.format : undefined);
    /** The script of one of a field's events, as the file holds it; `null` without one. */
    const scriptOf = (field: FormField, event: FieldScriptEvent): string | null => {
      const root = field.actions?.[event]?.root;
      return root?.type === 'javascript' ? root.script : null;
    };
    /** A field's format with its two scripts: what a format write leaves in the file. */
    const formatted = (field: FormField) => ({
      format: formatOf(field),
      formatScript: scriptOf(field, 'format'),
      keystrokeScript: scriptOf(field, 'keystroke'),
    });
    const read = async (doc: DocumentHandle, name: string) => doc.forms.get(named(name));
    const update = (doc: DocumentHandle, name: string, patch: FormFieldPatch) =>
      doc.apply({ ops: [{ type: 'forms.update', field: named(name), patch }] });
    /** A patch as untyped code could send it: what the types refuse and the engine must too. */
    const loose = (patch: Record<string, unknown>) => patch as FormFieldPatch;

    /* ── reading ──────────────────────────────────────────────────────────── */

    test('a format reads from the format script alone, as Acrobat decides it', async () => {
      await as('reader', async (doc) => {
        const { fields } = await doc.forms.list();
        const formats = Object.fromEntries(
          fields.filter((field) => 'format' in field).map((field) => [field.name, formatOf(field)]),
        );
        expect(formats).toEqual(FIXTURE_FORMATS);
        // A list and a signature field carry no `format`, script or not.
        const list = fields.find((field) => field.name === 'list_with_script')!;
        expect('format' in list).toBe(false);
        expect(scriptOf(list, 'format')).toBe(DATE_FORMAT);
        expect('format' in fields.find((field) => field.name === 'sign_here')!).toBe(false);
      });
    });

    test('a purpose reads from /EMBD_Metadata, on any kind of field', async () => {
      await as('reader', async (doc) => {
        const { fields } = await doc.forms.list();
        const purposes = Object.fromEntries(fields.map((field) => [field.name, field.purpose]));
        expect(purposes).toMatchObject({
          full_name: 'name',
          sign_here: 'signature',
          // No purpose a write takes, so none.
          spaced_purpose: null,
          plain_one: null,
        });
        expect((await read(doc, 'full_name')).groupId).toBe('attendee');
      });
    });

    /* ── purpose ──────────────────────────────────────────────────────────── */

    test('a create names a purpose on every kind, and it survives a save', async () => {
      let saved: Uint8Array | null = null;
      await as('designer', async (doc) => {
        const drafts: FormFieldDraft[] = [
          { kind: 'text', name: 'made_email', purpose: 'email' },
          { kind: 'checkbox', name: 'made_consent', purpose: 'acme:consent' },
          { kind: 'signature', name: 'made_signature', purpose: 'signature' },
          { kind: 'pushbutton', name: 'made_button', purpose: 'initials' },
          { kind: 'text', name: 'made_plain' },
          { kind: 'text', name: 'made_none', purpose: null },
        ];
        const created = [];
        for (const [row, draft] of drafts.entries()) {
          const widgets = [{ page: PAGE, rect: rect(row) }];
          created.push((await doc.forms.create({ ...draft, widgets })).field);
        }
        expect(created.map((field) => field.purpose)).toEqual([
          'email',
          'acme:consent',
          'signature',
          'initials',
          null,
          null,
        ]);
        saved = await doc.download();
      });
      await as(
        'reader',
        async (doc) => {
          const { fields } = await doc.forms.list();
          const purposes = Object.fromEntries(fields.map((field) => [field.name, field.purpose]));
          expect(purposes).toMatchObject({
            made_email: 'email',
            made_consent: 'acme:consent',
            made_signature: 'signature',
            made_button: 'initials',
            made_plain: null,
            made_none: null,
            full_name: 'name',
          });
        },
        saved!,
      );
    });

    test('an update sets a purpose, keeps it when left out, and null takes it away', async () => {
      await as('designer', async (doc) => {
        // A field in a group she has no right to assign: a purpose is form design alone.
        const set = await doc.forms.update(named('full_name'), { purpose: 'organization' });
        expect([set.field.purpose, set.field.groupId]).toEqual(['organization', 'attendee']);
        const kept = await doc.forms.update(named('full_name'), { required: true });
        expect([kept.field.purpose, kept.field.required]).toEqual(['organization', true]);
        const removed = await doc.forms.update(named('full_name'), { purpose: null });
        expect([removed.field.purpose, removed.field.groupId]).toEqual([null, 'attendee']);
        // None to take away is no change.
        expect((await doc.forms.update(named('plain_one'), { purpose: null })).field.purpose).toBe(
          null,
        );
        // A signature field has one like any other.
        const signature = await doc.forms.update(named('sign_here'), { purpose: 'initials' });
        expect(signature.field.purpose).toBe('initials');
      });
    });

    test('a purpose that is none is refused, and nothing is written', async () => {
      await as('designer', async (doc) => {
        const none = [
          '',
          ' email',
          'email ',
          '\tname',
          'p'.repeat(257),
          'billing\u0000account',
          7,
          {},
        ];
        for (const purpose of none) {
          expect(await refused(doc.forms.update(named('full_name'), loose({ purpose })))).toBe(
            EngineErrorCode.InvalidArg,
          );
          const draft = { kind: 'text', name: 'never_made', purpose } as unknown as FormFieldDraft;
          expect(await refused(doc.forms.create(draft))).toBe(EngineErrorCode.InvalidArg);
        }
        expect((await read(doc, 'full_name')).purpose).toBe('name');
        expect(await refused(doc.forms.get(named('never_made')))).toBe(EngineErrorCode.NotFound);
        // The longest one is taken as it is.
        const longest = 'p'.repeat(256);
        expect(
          (await doc.forms.update(named('full_name'), { purpose: longest })).field.purpose,
        ).toBe(longest);
        // Any character but a NUL is kept as it was written.
        for (const purpose of ['two\nlines', 'caf\u00e9', '\u65e5\u4ed8', 'a(b)\\c', 'a\u0001b']) {
          await doc.forms.update(named('full_name'), { purpose });
          expect((await read(doc, 'full_name')).purpose).toBe(purpose);
        }
      });
    });

    test('undo puts a purpose back, and its undo sets it again', async () => {
      await as('designer', async (doc) => {
        const changed = await update(doc, 'full_name', { purpose: 'email' });
        expect(changed.meta.undoable).toBe(true);
        const undone = await doc.apply({ undoOf: changed.meta.opId });
        expect((await read(doc, 'full_name')).purpose).toBe('name');
        await doc.apply({ undoOf: undone.meta.opId });
        expect((await read(doc, 'full_name')).purpose).toBe('email');

        // After a later change to the field, the undo puts the purpose back by value.
        const removed = await update(doc, 'sign_here', { purpose: null });
        await update(doc, 'sign_here', { required: true });
        await doc.apply({ undoOf: removed.meta.opId });
        const restored = await read(doc, 'sign_here');
        expect([restored.purpose, restored.required]).toEqual(['signature', true]);
      });
    });

    test('an update that expects a purpose applies only to a field that has it', async () => {
      await as('designer', async (doc) => {
        const expecting = (name: string, purpose: string | null) =>
          doc.apply({
            ops: [
              {
                type: 'forms.update',
                field: named(name),
                patch: { purpose: 'email' },
                expect: { purpose },
              },
            ],
          });
        expect(await refused(expecting('full_name', null))).toBe(EngineErrorCode.ChangeConflict);
        await expecting('full_name', 'name');
        expect((await read(doc, 'full_name')).purpose).toBe('email');
      });
    });

    /* ── format ───────────────────────────────────────────────────────────── */

    test('a create writes a date and a time as Acrobat writes them, with form design alone', async () => {
      let saved: Uint8Array | null = null;
      const expected = {
        made_date: {
          format: { kind: 'date', pattern: 'dd/mm/yyyy' },
          formatScript: 'AFDate_FormatEx("dd/mm/yyyy");',
          keystrokeScript: 'AFDate_KeystrokeEx("dd/mm/yyyy");',
        },
        made_time: {
          format: { kind: 'time', pattern: 'h:MM tt' },
          formatScript: 'AFTime_FormatEx("h:MM tt");',
          keystrokeScript: 'AFTime_Keystroke(1);',
        },
        made_dropdown: {
          format: { kind: 'date', pattern: 'mmm d, yyyy' },
          formatScript: 'AFDate_FormatEx("mmm d, yyyy");',
          keystrokeScript: 'AFDate_KeystrokeEx("mmm d, yyyy");',
        },
        made_plain: { format: null, formatScript: null, keystrokeScript: null },
        made_none: { format: null, formatScript: null, keystrokeScript: null },
      };
      await as('designer', async (doc) => {
        const drafts: FormFieldDraft[] = [
          { kind: 'text', name: 'made_date', format: { kind: 'date', pattern: 'dd/mm/yyyy' } },
          { kind: 'text', name: 'made_time', format: { kind: 'time', pattern: 'h:MM tt' } },
          {
            kind: 'combobox',
            name: 'made_dropdown',
            edit: true,
            format: { kind: 'date', pattern: 'mmm d, yyyy' },
          },
          { kind: 'text', name: 'made_plain' },
          { kind: 'text', name: 'made_none', format: null },
        ];
        for (const [row, draft] of drafts.entries()) {
          const widgets = [{ page: PAGE, rect: rect(row) }];
          const { field } = await doc.forms.create({ ...draft, widgets });
          expect(formatted(field)).toEqual(expected[field.name as keyof typeof expected]);
        }
        saved = await doc.download();
      });
      await as(
        'reader',
        async (doc) => {
          for (const [name, facts] of Object.entries(expected)) {
            expect(formatted(await read(doc, name))).toEqual(facts);
          }
        },
        saved!,
      );
    });

    test('an update sets a format, replaces one, and null removes it', async () => {
      await as('designer', async (doc) => {
        const set = await doc.forms.update(named('plain_six'), {
          format: { kind: 'date', pattern: 'yyyy-mm-dd' },
        });
        expect(formatted(set.field)).toEqual({
          format: { kind: 'date', pattern: 'yyyy-mm-dd' },
          formatScript: 'AFDate_FormatEx("yyyy-mm-dd");',
          keystrokeScript: 'AFDate_KeystrokeEx("yyyy-mm-dd");',
        });
        // Left out, it stays.
        const kept = await doc.forms.update(named('plain_six'), { required: true });
        expect(formatOf(kept.field)).toEqual({ kind: 'date', pattern: 'yyyy-mm-dd' });
        const replaced = await doc.forms.update(named('plain_six'), {
          format: { kind: 'time', pattern: 'HH:MM:ss' },
        });
        expect(formatted(replaced.field)).toEqual({
          format: { kind: 'time', pattern: 'HH:MM:ss' },
          formatScript: 'AFTime_FormatEx("HH:MM:ss");',
          keystrokeScript: 'AFTime_Keystroke(2);',
        });
        const removed = await doc.forms.update(named('plain_six'), { format: null });
        expect(formatted(removed.field)).toEqual({
          format: null,
          formatScript: null,
          keystrokeScript: null,
        });
        expect(removed.field.actions === undefined).toBe(true);
        // A dropdown takes one as a text field does.
        const dropdown = await doc.forms.update(named('dropdown_date'), {
          format: { kind: 'date', pattern: 'd-mmm-yy' },
        });
        expect(formatOf(dropdown.field)).toEqual({ kind: 'date', pattern: 'd-mmm-yy' });
      });
    });

    test("a format owns the field's two scripts, and a keystroke script alone is no format", async () => {
      await as('designer', async (doc) => {
        // `null` removes another format too, with its keystroke script.
        const cleared = await doc.forms.update(named('plain_five'), { format: null });
        expect(formatted(cleared.field)).toEqual({
          format: null,
          formatScript: null,
          keystrokeScript: null,
        });
        // No format to remove: the keystroke script on its own stays.
        const alone = await doc.forms.update(named('plain_three'), { format: null });
        expect(formatted(alone.field)).toEqual({
          format: null,
          formatScript: null,
          keystrokeScript: DATE_KEYSTROKE,
        });
        // A format replaces a keystroke script it didn't write.
        const taken = await doc.forms.update(named('own_keystroke'), {
          format: { kind: 'time', pattern: 'HH:MM' },
        });
        expect(formatted(taken.field)).toEqual({
          format: { kind: 'time', pattern: 'HH:MM' },
          formatScript: 'AFTime_FormatEx("HH:MM");',
          keystrokeScript: 'AFTime_Keystroke(0);',
        });
      });
    });

    test('the format a field already has changes nothing, and another write keeps its scripts', async () => {
      await as('designer', async (doc) => {
        const older = {
          format: { kind: 'date', pattern: 'm/d' },
          formatScript: 'AFDate_Format(0);',
          keystrokeScript: 'AFDate_Keystroke(0);',
        };
        const same = await doc.forms.update(named('plain_four'), {
          format: { kind: 'date', pattern: 'm/d' },
        });
        expect(formatted(same.field)).toEqual(older);
        // A format the engine doesn't know stays through a write of something else.
        const other = await doc.forms.update(named('plain_five'), { required: true });
        expect(formatted(other.field)).toEqual({
          format: { kind: 'other' },
          formatScript: NUMBER_FORMAT,
          keystrokeScript: NUMBER_KEYSTROKE,
        });
        // So does a date format with a keystroke script of its own.
        const own = await doc.forms.update(named('own_keystroke'), { alternateName: 'A date' });
        expect(formatted(own.field)).toEqual({
          format: { kind: 'date', pattern: 'm/d/yy' },
          formatScript: DATE_FORMAT,
          keystrokeScript: 'event.rc = true;',
        });
      });
    });

    test('a format that is none is refused before anything is written', async () => {
      await as('everything', async (doc) => {
        const before = formatted(await read(doc, 'plain_one'));
        const formats: unknown[] = [
          { kind: 'other' },
          { kind: 'number', pattern: '0.00' },
          { kind: 'date' },
          { kind: 'date', pattern: '' },
          { kind: 'date', pattern: 'm/d/yy");app.alert("x' },
          { kind: 'date', pattern: 'm\\d' },
          { kind: 'date', pattern: "d 'of' mmmm" },
          { kind: 'date', pattern: 'dddd, mmmm d' },
          { kind: 'date', pattern: 'yyy' },
          { kind: 'date', pattern: 'd/m/y' },
          // Patterns whose own writing doesn't read back.
          { kind: 'date', pattern: 'yyyymmdd' },
          { kind: 'time', pattern: 'HH.MM' },
          { kind: 'time', pattern: 'H:M' },
          { kind: 'date', pattern: 'dd:mm:yyyy' },
          { kind: 'date', pattern: '/ - .' },
          { kind: 'date', pattern: `dd${' '.repeat(59)}yyyy` },
          // A part of the date written twice.
          { kind: 'date', pattern: 'yyyy/mm/mm/dd' },
          { kind: 'date', pattern: 'mmm mm d' },
          { kind: 'time', pattern: 'HH:MM s' },
          // A pattern of the other kind: a time alone as a date, a date as a time.
          { kind: 'date', pattern: 'HH:MM' },
          { kind: 'date', pattern: 'h:MM:ss tt' },
          { kind: 'time', pattern: 'dd/mm/yyyy' },
          { kind: 'time', pattern: 'yyyy' },
          { kind: 'time', pattern: 'm/d/yy HH:MM' },
          'dd/mm/yyyy',
        ];
        for (const format of formats) {
          expect(await refused(doc.forms.update(named('plain_one'), loose({ format })))).toBe(
            EngineErrorCode.InvalidArg,
          );
          const draft = { kind: 'text', name: 'never_made', format } as unknown as FormFieldDraft;
          expect(await refused(doc.forms.create(draft))).toBe(EngineErrorCode.InvalidArg);
        }
        expect(formatted(await read(doc, 'plain_one'))).toEqual(before);
        expect(await refused(doc.forms.get(named('never_made')))).toBe(EngineErrorCode.NotFound);
        // The longest pattern is taken.
        const longest = `dd${' '.repeat(58)}yyyy`;
        const taken = await doc.forms.update(named('plain_one'), {
          format: { kind: 'date', pattern: longest },
        });
        expect(formatOf(taken.field)).toEqual({ kind: 'date', pattern: longest });
        // A date may carry a time, and its keystroke script takes the same pattern.
        const withTime = { kind: 'date', pattern: 'dd/mm/yyyy HH:MM' } as const;
        const dated = await doc.forms.update(named('plain_one'), { format: withTime });
        expect(formatted(dated.field)).toEqual({
          format: withTime,
          formatScript: 'AFDate_FormatEx("dd/mm/yyyy HH:MM");',
          keystrokeScript: 'AFDate_KeystrokeEx("dd/mm/yyyy HH:MM");',
        });
      });
    });

    test('a format goes on a text field and a dropdown only, and not beside a script for its events', async () => {
      await as('everything', async (doc) => {
        const date = { kind: 'date', pattern: 'dd/mm/yyyy' } as const;
        for (const name of ['list_with_script', 'sign_here']) {
          expect(await refused(doc.forms.update(named(name), loose({ format: date })))).toBe(
            EngineErrorCode.InvalidArg,
          );
          expect(await refused(doc.forms.update(named(name), loose({ format: null })))).toBe(
            EngineErrorCode.InvalidArg,
          );
        }
        const checkbox = { kind: 'checkbox', name: 'never_made', format: date };
        expect(await refused(doc.forms.create(checkbox as unknown as FormFieldDraft))).toBe(
          EngineErrorCode.InvalidArg,
        );
        const script = { type: 'javascript', script: 'event.rc = true;' } as const;
        for (const actions of [{ format: script }, { keystroke: script }, { keystroke: null }]) {
          expect(
            await refused(doc.forms.update(named('plain_six'), { format: date, actions })),
          ).toBe(EngineErrorCode.InvalidArg);
          expect(
            await refused(
              doc.forms.create({ kind: 'text', name: 'never_made', format: date, actions }),
            ),
          ).toBe(EngineErrorCode.InvalidArg);
        }
        expect(formatted(await read(doc, 'plain_six')).format).toBe(null);
        expect(await refused(doc.forms.get(named('never_made')))).toBe(EngineErrorCode.NotFound);
        // A script for another event goes with a format.
        const both = await doc.forms.update(named('plain_six'), {
          format: date,
          actions: { validate: script },
        });
        expect(formatOf(both.field)).toEqual(date);
        expect(scriptOf(both.field, 'validate')).toBe('event.rc = true;');
      });
    });

    test("a format read back in actions is the scripts', and a script write changes it", async () => {
      await as('everything', async (doc) => {
        const dated = await doc.forms.update(named('plain_six'), {
          actions: { format: { type: 'javascript', script: 'AFDate_FormatEx("d/m/yy")' } },
        });
        expect(formatOf(dated.field)).toEqual({ kind: 'date', pattern: 'd/m/yy' });
        const coded = await doc.forms.update(named('plain_six'), {
          actions: { format: { type: 'javascript', script: 'event.value = "x";' } },
        });
        expect(formatOf(coded.field)).toEqual({ kind: 'other' });
        const cleared = await doc.forms.update(named('plain_six'), { actions: { format: null } });
        expect(formatOf(cleared.field)).toBe(null);
      });
    });

    test('undo puts a format back with the scripts it had, and its undo sets it again', async () => {
      await as('designer', async (doc) => {
        const older = {
          format: { kind: 'date', pattern: 'm/d' },
          formatScript: 'AFDate_Format(0);',
          keystrokeScript: 'AFDate_Keystroke(0);',
        };
        const written = {
          format: { kind: 'time', pattern: 'HH:MM' },
          formatScript: 'AFTime_FormatEx("HH:MM");',
          keystrokeScript: 'AFTime_Keystroke(0);',
        } as const;
        const changed = await update(doc, 'plain_four', { format: written.format });
        expect(changed.meta.undoable).toBe(true);
        expect(formatted(await read(doc, 'plain_four'))).toEqual(written);
        const undone = await doc.apply({ undoOf: changed.meta.opId });
        expect(formatted(await read(doc, 'plain_four'))).toEqual(older);
        await doc.apply({ undoOf: undone.meta.opId });
        expect(formatted(await read(doc, 'plain_four'))).toEqual(written);

        // A removed number format comes back whole.
        const removed = await update(doc, 'plain_five', { format: null });
        expect(formatted(await read(doc, 'plain_five')).format).toBe(null);
        await doc.apply({ undoOf: removed.meta.opId });
        expect(formatted(await read(doc, 'plain_five'))).toEqual({
          format: { kind: 'other' },
          formatScript: NUMBER_FORMAT,
          keystrokeScript: NUMBER_KEYSTROKE,
        });

        // After a later change to the field, the undo puts the format back by value.
        const set = await update(doc, 'plain_six', {
          format: { kind: 'date', pattern: 'dd/mm/yyyy' },
        });
        await update(doc, 'plain_six', { required: true });
        await doc.apply({ undoOf: set.meta.opId });
        const restored = await read(doc, 'plain_six');
        expect([formatOf(restored), restored.required]).toEqual([null, true]);
      });
    });

    test('after a later change, the undo of a format puts back the scripts it replaced', async () => {
      await as('designer', async (doc) => {
        const date = { kind: 'date', pattern: 'dd/mm/yyyy' } as const;
        // A number format a date replaced comes back whole, though no write names it.
        const overNumber = await update(doc, 'plain_five', { format: date });
        await update(doc, 'plain_five', { required: true });
        await doc.apply({ undoOf: overNumber.meta.opId });
        const numbered = await read(doc, 'plain_five');
        expect([formatted(numbered), numbered.required]).toEqual([
          {
            format: { kind: 'other' },
            formatScript: NUMBER_FORMAT,
            keystrokeScript: NUMBER_KEYSTROKE,
          },
          true,
        ]);
        // An older wording comes back as it was written.
        const overOlder = await update(doc, 'plain_four', {
          format: { kind: 'time', pattern: 'HH:MM' },
        });
        await update(doc, 'plain_four', { required: true });
        await doc.apply({ undoOf: overOlder.meta.opId });
        expect(formatted(await read(doc, 'plain_four'))).toEqual({
          format: { kind: 'date', pattern: 'm/d' },
          formatScript: 'AFDate_Format(0);',
          keystrokeScript: 'AFDate_Keystroke(0);',
        });
      });
    });

    test('the undo of a format leaves a script written since', async () => {
      await as('everything', async (doc) => {
        const date = { kind: 'date', pattern: 'dd/mm/yyyy' } as const;
        const own = 'event.rc = /^[0-9/]*$/.test(event.value);';
        const set = await update(doc, 'plain_six', { format: date });
        await update(doc, 'plain_six', {
          actions: { keystroke: { type: 'javascript', script: own } },
        });
        // The keystroke script is someone's later work: the undo removes neither script.
        const undone = await doc.apply({ undoOf: set.meta.opId });
        expect(undone.items.map((item) => item.type)).toEqual(['skipped']);
        expect(formatted(await read(doc, 'plain_six'))).toEqual({
          format: date,
          formatScript: 'AFDate_FormatEx("dd/mm/yyyy");',
          keystrokeScript: own,
        });
      });
    });

    test('the undo of a format over actions no write can make puts all back, or nothing', async () => {
      const date = { kind: 'date', pattern: 'dd/mm/yyyy' } as const;
      const written = {
        format: date,
        formatScript: 'AFDate_FormatEx("dd/mm/yyyy");',
        keystrokeScript: 'AFDate_KeystrokeEx("dd/mm/yyyy");',
      };
      /** The kinds of action a field's format event runs, in order. */
      const chain = (field: FormField): string[] => {
        const root = field.actions?.format?.root;
        return root ? [root.type, ...root.next.map((next) => next.type)] : [];
      };
      await as('designer', async (doc) => {
        expect(chain(await read(doc, 'goes_on'))).toEqual(['javascript', 'goto']);
        // With nothing changed since, the undo is exact: the script and its GoTo are back.
        const set = await update(doc, 'goes_on', { format: date });
        expect(formatted(await read(doc, 'goes_on'))).toEqual(written);
        await doc.apply({ undoOf: set.meta.opId });
        const back = await read(doc, 'goes_on');
        expect([chain(back), formatOf(back), scriptOf(back, 'keystroke')]).toEqual([
          ['javascript', 'goto'],
          { kind: 'other' },
          null,
        ]);
      });
      await as('designer', async (doc) => {
        // After a later change the GoTo can't go back by value, so neither script is touched:
        // the format stays whole, and the undo says it left the field alone.
        const set = await update(doc, 'goes_on', { format: date });
        await update(doc, 'goes_on', { required: true });
        const undone = await doc.apply({ undoOf: set.meta.opId });
        expect(undone.items.map((item) => item.type)).toEqual(['skipped']);
        const kept = await read(doc, 'goes_on');
        expect([formatted(kept), kept.required]).toEqual([written, true]);
      });
      await as('everything', async (doc) => {
        // A script written over such actions follows the same rule.
        const own = 'event.value = event.value.trim();';
        const set = await update(doc, 'goes_on', {
          actions: { format: { type: 'javascript', script: own } },
        });
        await update(doc, 'goes_on', { required: true });
        const undone = await doc.apply({ undoOf: set.meta.opId });
        expect(undone.items.map((item) => item.type)).toEqual(['skipped']);
        expect(scriptOf(await read(doc, 'goes_on'), 'format')).toBe(own);
      });
    });

    test('an update that expects a format applies only to a field that has it', async () => {
      await as('designer', async (doc) => {
        const expecting = (name: string, format: FormFieldFormatWritable | null) =>
          doc.apply({
            ops: [
              {
                type: 'forms.update',
                field: named(name),
                patch: { format: { kind: 'time', pattern: 'HH:MM' } },
                expect: { format },
              },
            ],
          });
        expect(await refused(expecting('plain_one', null))).toBe(EngineErrorCode.ChangeConflict);
        await expecting('plain_one', { kind: 'date', pattern: 'm/d/yy' });
        expect(formatOf(await read(doc, 'plain_one'))).toEqual({ kind: 'time', pattern: 'HH:MM' });
      });
    });

    /* ── copies ───────────────────────────────────────────────────────────── */

    test('a copy keeps a purpose and a date or time format, without the right to write scripts', async () => {
      await as('designer', async (doc) => {
        await doc.forms.update(named('plain_one'), { purpose: 'date-signed' });
        const copied = await doc.forms.copy([
          named('plain_one'),
          named('time_numbered'),
          named('dropdown_date'),
          named('sign_here'),
        ]);
        const facts = copied.fields.map((field) => ({
          purpose: field.purpose,
          ...formatted(field),
        }));
        expect(facts).toEqual([
          {
            purpose: 'date-signed',
            format: { kind: 'date', pattern: 'm/d/yy' },
            formatScript: DATE_FORMAT,
            keystrokeScript: DATE_KEYSTROKE,
          },
          {
            purpose: null,
            format: { kind: 'time', pattern: 'h:MM tt' },
            formatScript: 'AFTime_FormatEx("h:MM tt");',
            keystrokeScript: 'AFTime_Keystroke(1);',
          },
          {
            purpose: null,
            format: { kind: 'date', pattern: 'yyyy-mm-dd' },
            formatScript: 'AFDate_FormatEx("yyyy-mm-dd");',
            keystrokeScript: 'AFDate_KeystrokeEx("yyyy-mm-dd");',
          },
          { purpose: 'signature', format: undefined, formatScript: null, keystrokeScript: null },
        ]);
        // The format came along whole, so nothing of it is reported as left out.
        expect(copied.dropped).toEqual([]);
      });
    });

    test('a copy without the script right leaves out what is no date or time format, and says so', async () => {
      await as('designer', async (doc) => {
        const copied = await doc.forms.copy([named('plain_five'), named('own_keystroke')]);
        expect(copied.fields.map(formatted)).toEqual([
          { format: null, formatScript: null, keystrokeScript: null },
          // The date format stays; its keystroke script is the format's own now.
          {
            format: { kind: 'date', pattern: 'm/d/yy' },
            formatScript: DATE_FORMAT,
            keystrokeScript: DATE_KEYSTROKE,
          },
        ]);
        expect(copied.dropped.map((drop) => [drop.field, drop.reason]).sort()).toEqual([
          ['actions.format', 'script-not-allowed'],
          ['actions.keystroke', 'script-not-allowed'],
          ['actions.keystroke', 'script-not-allowed'],
        ]);
      });
    });

    test('a copy with the script right keeps the scripts as they are written', async () => {
      await as('everything', async (doc) => {
        const copied = await doc.forms.copy([named('plain_four'), named('own_keystroke')]);
        expect(copied.fields.map(formatted)).toEqual([
          {
            format: { kind: 'date', pattern: 'm/d' },
            formatScript: 'AFDate_Format(0);',
            keystrokeScript: 'AFDate_Keystroke(0);',
          },
          {
            format: { kind: 'date', pattern: 'm/d/yy' },
            formatScript: DATE_FORMAT,
            keystrokeScript: 'event.rc = true;',
          },
        ]);
        expect(copied.dropped).toEqual([]);
      });
    });

    test('an import keeps a purpose and a format, with form design alone', async () => {
      type Bundle = Awaited<ReturnType<DocumentHandle['forms']['export']>>;
      let formats: Bundle | null = null;
      let everything: Bundle | null = null;
      let blank: Uint8Array | null = null;
      await as('everything', async (doc) => {
        await doc.forms.update(named('plain_two'), { purpose: 'date-signed' });
        const dated = [named('plain_two'), named('time_pattern')];
        formats = await doc.forms.export({ fields: dated });
        // With a field in a group the designer may not assign, for the restore below.
        everything = await doc.forms.export({ fields: [...dated, named('full_name')] });
        for (const { ref } of (await doc.forms.list()).fields) await doc.forms.delete(ref);
        blank = await doc.download();
      });
      await as(
        'designer',
        async (doc) => {
          const imported = await doc.forms.import(formats!, { attribution: 'stamp' });
          expect(imported.fields.find((field) => field.name === 'plain_two')!.purpose).toBe(
            'date-signed',
          );
          const facts = Object.fromEntries(
            imported.fields.map((field) => [field.name, formatted(field)]),
          );
          expect(facts).toEqual({
            plain_two: {
              format: { kind: 'date', pattern: 'm/d/yy' },
              formatScript: DATE_FORMAT,
              keystrokeScript: DATE_KEYSTROKE,
            },
            time_pattern: {
              format: { kind: 'time', pattern: 'HH:MM' },
              formatScript: 'AFTime_FormatEx("HH:MM");',
              keystrokeScript: 'AFTime_Keystroke(0);',
            },
          });
          expect(imported.dropped).toEqual([]);
        },
        blank!,
      );
      await as(
        'everything',
        async (doc) => {
          const restored = await doc.forms.import(everything!, { attribution: 'restore' });
          const full = restored.fields.find((field) => field.name === 'full_name')!;
          expect([full.purpose, full.groupId]).toEqual(['name', 'attendee']);
          // With the script right, the scripts come along as they are written.
          expect(
            formatted(restored.fields.find((field) => field.name === 'time_pattern')!),
          ).toEqual({
            format: { kind: 'time', pattern: 'HH:MM' },
            formatScript: 'AFTime_FormatEx("HH:MM");',
            keystrokeScript: 'AFTime_Keystroke(0);',
          });
        },
        blank!,
      );
    });

    /* ── rights ───────────────────────────────────────────────────────────── */

    test('both take form design: enough on its own, and refused without it', async () => {
      await as('filler', async (doc) => {
        const date = { kind: 'date', pattern: 'm/d/yy' } as const;
        const writes: (() => Promise<unknown>)[] = [
          () => doc.forms.update(named('plain_six'), { purpose: 'email' }),
          () => doc.forms.update(named('plain_six'), { format: date }),
          () => doc.forms.update(named('plain_one'), { format: null }),
          () => doc.forms.create({ kind: 'text', name: 'never_made', purpose: 'email' }),
          () => doc.forms.create({ kind: 'text', name: 'never_made', format: date }),
        ];
        for (const write of writes) {
          const error = await refusal(write());
          expect(codeOf(error)).toBe(EngineErrorCode.Forbidden);
          expect((error as EngineError).details).toMatchObject({ required: 'doc.forms.modify' });
        }
        // She reads both.
        const read = await doc.forms.get(named('full_name'));
        expect(read.purpose).toBe('name');
        expect(formatOf(await doc.forms.get(named('plain_one')))).toEqual({
          kind: 'date',
          pattern: 'm/d/yy',
        });
      });
      await as('designer', async (doc) => {
        // The same format as a script of her own takes the script right, which she lacks.
        const scripted = await refusal(
          doc.forms.update(named('plain_six'), {
            actions: { format: { type: 'javascript', script: DATE_FORMAT } },
          }),
        );
        expect(codeOf(scripted)).toBe(EngineErrorCode.Forbidden);
        expect((scripted as EngineError).details).toMatchObject({ required: 'doc.forms.script' });
        const format = { kind: 'date', pattern: 'm/d/yy' } as const;
        const set = await doc.forms.update(named('plain_six'), { format, purpose: 'date-signed' });
        expect([formatOf(set.field), set.field.purpose]).toEqual([format, 'date-signed']);
      });
    });
  });
}
