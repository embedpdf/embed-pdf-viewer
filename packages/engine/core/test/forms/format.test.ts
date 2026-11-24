import { describe, expect, test } from 'vitest';

import type { FieldActionsPatch, PdfActionTree, PdfFieldActions } from '../../src/dto/PdfAction';
import { EngineError } from '../../src/errors/EngineError';
import { EngineErrorCode } from '../../src/errors/EngineErrorCode';
import {
  checkedFormat,
  formatOfActions,
  formatOfScript,
  formatScripts,
  formatsEqual,
  formatWriteOf,
  isKeystrokeOfFormat,
  scriptsOfFormat,
  scriptTreeOf,
  takesFormat,
} from '../../src/forms/format';
import { checkedPurpose, isFieldPurpose } from '../../src/forms/purpose';

const tree = (script: string): PdfActionTree<unknown> => scriptTreeOf(script);
const actions = (format?: string, keystroke?: string): PdfFieldActions<unknown> => ({
  ...(format !== undefined ? { format: tree(format) } : {}),
  ...(keystroke !== undefined ? { keystroke: tree(keystroke) } : {}),
});
const refusal = (run: () => unknown): { code: string; field: unknown } | null => {
  try {
    run();
    return null;
  } catch (error) {
    if (!EngineError.is(error)) throw error;
    return { code: error.code, field: (error.details as { field?: unknown } | undefined)?.field };
  }
};

describe("a field's format", () => {
  test("Acrobat's date and time calls read as a date and a time", () => {
    const date = (pattern: string) => ({ kind: 'date', pattern });
    const time = (pattern: string) => ({ kind: 'time', pattern });
    expect(formatOfScript('AFDate_FormatEx("m/d/yy");')).toEqual(date('m/d/yy'));
    expect(formatOfScript('AFDate_FormatEx("dd/mm/yyyy")')).toEqual(date('dd/mm/yyyy'));
    expect(formatOfScript("AFDate_FormatEx('dd.mm.yyyy');")).toEqual(date('dd.mm.yyyy'));
    expect(formatOfScript('  AFDate_FormatEx( "yyyy-mm-dd" ) ;\n')).toEqual(date('yyyy-mm-dd'));
    expect(formatOfScript('AFTime_FormatEx("HH:MM:ss");')).toEqual(time('HH:MM:ss'));
    // The older calls name a pattern of Acrobat's list by number.
    expect(formatOfScript('AFDate_Format(0);')).toEqual(date('m/d'));
    expect(formatOfScript('AFDate_Format(2);')).toEqual(date('mm/dd/yy'));
    expect(formatOfScript('AFDate_Format( 13 )')).toEqual(date('m/d/yy HH:MM'));
    expect(formatOfScript('AFTime_Format(3);')).toEqual(time('h:MM:ss tt'));
  });

  test('every other script is another format', () => {
    for (const script of [
      '',
      'AFNumber_Format(2, 0, 0, 0, "", true);',
      'AFPercent_Format(2, 0);',
      'AFSpecial_Format(0);',
      'event.value = "x";',
      // More than the one call.
      'var seen = 1; AFDate_FormatEx("m/d/yy");',
      'AFDate_FormatEx("m/d/yy"); app.beep();',
      'AFDate_FormatEx("m/d/yy");;',
      'AFDate_FormatEx("m/d/yy")\n// a comment',
      'if (true) AFDate_FormatEx("m/d/yy");',
      // Not the call as Acrobat writes it.
      'AFDate_FormatEx(pattern);',
      'AFDate_FormatEx("m/d/yy", 1);',
      'AFDate_FormatEx("m/d" + "/yy");',
      'AFDate_FormatEx("m/d/yy\');',
      'AFDate_FormatEx("m\\/d");',
      'this.AFDate_FormatEx("m/d/yy");',
      'afdate_formatex("m/d/yy");',
      // A pattern the engine doesn't take, a number the list doesn't have.
      'AFDate_FormatEx("dddd, mmmm d, yyyy");',
      'AFDate_FormatEx("yyyymmdd");',
      'AFTime_FormatEx("HH.MM");',
      'AFDate_FormatEx("");',
      'AFDate_FormatEx("yyyy/mm/mm/dd");',
      // A pattern of the other kind: a date call with a time alone, a time call with a date in it.
      'AFDate_FormatEx("HH:MM");',
      'AFDate_FormatEx("h:MM:ss tt");',
      'AFTime_FormatEx("dd/mm/yyyy");',
      'AFTime_FormatEx("yyyy");',
      'AFTime_FormatEx("m/d/yy HH:MM");',
      'AFDate_Format(14);',
      'AFDate_Format(-1);',
      'AFDate_Format(2.5);',
      'AFTime_Format(4);',
      // The keystroke calls are no format script.
      'AFDate_KeystrokeEx("m/d/yy");',
      'AFDate_Keystroke(0);',
      // The number goes with the numbered call, the pattern with the other.
      'AFDate_FormatEx(2);',
      'AFDate_Format("m/d/yy");',
    ]) {
      expect(formatOfScript(script), script).toEqual({ kind: 'other' });
    }
  });

  test('a long run of spaces is read in one pass', () => {
    const padded = `AFDate_Format(1)${' '.repeat(200_000)}x`;
    const started = Date.now();
    expect(formatOfScript(padded)).toEqual({ kind: 'other' });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test('the format script decides: a keystroke script on its own is no format', () => {
    expect(formatOfActions(undefined)).toBe(null);
    expect(formatOfActions({})).toBe(null);
    expect(formatOfActions(actions(undefined, 'AFDate_KeystrokeEx("m/d/yy");'))).toBe(null);
    expect(formatOfActions(actions('AFDate_FormatEx("m/d/yy");'))).toEqual({
      kind: 'date',
      pattern: 'm/d/yy',
    });
    expect(formatOfActions(actions('AFDate_FormatEx("m/d/yy");', 'event.rc = true;'))).toEqual({
      kind: 'date',
      pattern: 'm/d/yy',
    });
  });

  test('a format action that is not one script is another format', () => {
    const script = tree('AFDate_FormatEx("m/d/yy");');
    const chained = {
      ...script,
      root: { ...script.root!, next: [tree('app.beep();').root!] },
    };
    for (const format of [
      chained,
      { ...script, incomplete: true },
      { ...script, root: null },
      {
        root: { type: 'named', subtype: 'Named', name: 'Print', next: [] },
        incomplete: false,
        warnings: [],
      },
    ]) {
      expect(formatOfActions({ format } as PdfFieldActions<unknown>)).toEqual({ kind: 'other' });
    }
    // An answer not yet checked is read without trusting its shape.
    for (const format of [
      'x',
      5,
      {},
      { root: {} },
      { root: { type: 'javascript' }, incomplete: false },
    ]) {
      expect(formatOfActions({ format } as unknown as PdfFieldActions<unknown>)).toEqual({
        kind: 'other',
      });
    }
  });

  test('a format is written as the two scripts Acrobat writes', () => {
    expect(formatScripts({ kind: 'date', pattern: 'dd/mm/yyyy' })).toEqual({
      format: 'AFDate_FormatEx("dd/mm/yyyy");',
      keystroke: 'AFDate_KeystrokeEx("dd/mm/yyyy");',
    });
    // Acrobat has no keystroke call that takes a time's pattern: the script
    // names the standard time pattern of the same shape, by number.
    expect(formatScripts({ kind: 'time', pattern: 'h:MM tt' })).toEqual({
      format: 'AFTime_FormatEx("h:MM tt");',
      keystroke: 'AFTime_Keystroke(1);',
    });
    const numbered = (pattern: string) => formatScripts({ kind: 'time', pattern }).keystroke;
    expect(['HH:MM', 'h:MM tt', 'HH:MM:ss', 'h:MM:ss tt'].map(numbered)).toEqual([
      'AFTime_Keystroke(0);',
      'AFTime_Keystroke(1);',
      'AFTime_Keystroke(2);',
      'AFTime_Keystroke(3);',
    ]);
    // A pattern of the author's own gets the number of the standard one of its shape.
    expect(['H:MM', 'hh:MM tt', 'hh:MM:ss', 'H:MM:sstt'].map(numbered)).toEqual([
      'AFTime_Keystroke(0);',
      'AFTime_Keystroke(1);',
      'AFTime_Keystroke(2);',
      'AFTime_Keystroke(3);',
    ]);
    expect(scriptsOfFormat({ kind: 'date', pattern: 'm/d' })).toEqual({
      format: { type: 'javascript', script: 'AFDate_FormatEx("m/d");' },
      keystroke: { type: 'javascript', script: 'AFDate_KeystrokeEx("m/d");' },
    });
    expect(scriptsOfFormat(null)).toEqual({ format: null, keystroke: null });
  });

  test('what is written reads back as the same format', () => {
    for (const format of [
      { kind: 'date', pattern: 'dd/mm/yyyy' },
      { kind: 'date', pattern: 'mmmm d, yyyy' },
      { kind: 'time', pattern: 'HH:MM:ss' },
    ] as const) {
      const scripts = formatScripts(format);
      expect(formatOfScript(scripts.format)).toEqual(format);
      expect(isKeystrokeOfFormat(format, tree(scripts.keystroke))).toBe(true);
    }
  });

  test("a keystroke script is the format's own by pattern or by number, in its kind", () => {
    const date = { kind: 'date', pattern: 'm/d' } as const;
    expect(isKeystrokeOfFormat(date, tree('AFDate_KeystrokeEx("m/d");'))).toBe(true);
    expect(isKeystrokeOfFormat(date, tree('AFDate_Keystroke(0);'))).toBe(true);
    expect(isKeystrokeOfFormat(date, tree('AFDate_Keystroke(1);'))).toBe(false);
    expect(isKeystrokeOfFormat(date, tree('AFDate_KeystrokeEx("m/d/yy");'))).toBe(false);
    expect(isKeystrokeOfFormat(date, tree('AFTime_KeystrokeEx("m/d");'))).toBe(false);
    expect(isKeystrokeOfFormat(date, tree('event.rc = true;'))).toBe(false);
    expect(isKeystrokeOfFormat(date, undefined)).toBe(false);
    // A time's is Acrobat's numbered call, whichever standard pattern it
    // names, or another tool's call with the same pattern.
    const time = { kind: 'time', pattern: 'HH:MM' } as const;
    expect(isKeystrokeOfFormat(time, tree('AFTime_Keystroke(0);'))).toBe(true);
    expect(isKeystrokeOfFormat(time, tree('AFTime_Keystroke(3);'))).toBe(true);
    expect(isKeystrokeOfFormat(time, tree('AFTime_Keystroke(4);'))).toBe(false);
    expect(isKeystrokeOfFormat(time, tree('AFTime_KeystrokeEx("HH:MM");'))).toBe(true);
    expect(isKeystrokeOfFormat(time, tree('AFTime_KeystrokeEx("h:MM tt");'))).toBe(false);
    expect(isKeystrokeOfFormat(time, tree('AFDate_KeystrokeEx("HH:MM");'))).toBe(false);
    expect(isKeystrokeOfFormat(time, tree('AFDate_Keystroke(0);'))).toBe(false);
    expect(isKeystrokeOfFormat(time, tree('event.rc = true;'))).toBe(false);
  });

  test('a write takes a date or a time with a pattern, or null', () => {
    expect(checkedFormat(null)).toBe(null);
    expect(checkedFormat({ kind: 'date', pattern: 'dd/mm/yyyy' })).toEqual({
      kind: 'date',
      pattern: 'dd/mm/yyyy',
    });
    // Only what a format is goes on: a member beside it is dropped, not written.
    expect(checkedFormat({ kind: 'time', pattern: 'HH:MM', script: 'x' })).toEqual({
      kind: 'time',
      pattern: 'HH:MM',
    });
    const invalid = { code: EngineErrorCode.InvalidArg, field: 'format' };
    expect(refusal(() => checkedFormat({ kind: 'other' }))).toEqual(invalid);
    expect(refusal(() => checkedFormat({ kind: 'number', pattern: '0.00' }))).toEqual(invalid);
    expect(refusal(() => checkedFormat('dd/mm/yyyy'))).toEqual(invalid);
    expect(refusal(() => checkedFormat(undefined))).toEqual(invalid);
    for (const pattern of ['', 'dddd', 'd");x("', 'd\\m', undefined, 5]) {
      expect(refusal(() => checkedFormat({ kind: 'date', pattern }))).toEqual({
        code: EngineErrorCode.InvalidArg,
        field: 'format.pattern',
      });
    }
  });

  test("a write's pattern is one of its kind: a date has a date, a time is a time alone", () => {
    const pattern = { code: EngineErrorCode.InvalidArg, field: 'format.pattern' };
    // A date may carry a time, as two of Acrobat's own do.
    expect(checkedFormat({ kind: 'date', pattern: 'm/d/yy HH:MM' })).toEqual({
      kind: 'date',
      pattern: 'm/d/yy HH:MM',
    });
    expect(checkedFormat({ kind: 'time', pattern: 'hh:MM:ss tt' })).toEqual({
      kind: 'time',
      pattern: 'hh:MM:ss tt',
    });
    for (const time of ['HH:MM', 'h:MM tt', 'HH:MM:ss']) {
      expect(
        refusal(() => checkedFormat({ kind: 'date', pattern: time })),
        time,
      ).toEqual(pattern);
    }
    for (const date of ['dd/mm/yyyy', 'yyyy', 'm/d/yy HH:MM', 'h:MM tt, d mmm', 'HH.MM', '']) {
      expect(
        refusal(() => checkedFormat({ kind: 'time', pattern: date })),
        date,
      ).toEqual(pattern);
    }
  });

  test('a refused pattern is told the rule of its kind', () => {
    const told = (format: unknown): string => {
      try {
        checkedFormat(format);
      } catch (error) {
        if (EngineError.is(error)) return error.message;
      }
      return '';
    };
    const date = told({ kind: 'date', pattern: 'HH:MM' });
    expect(date).toContain("a date format's pattern");
    expect(date).toContain('yyyy yy mmmm mmm mm m dd d, at least one of them');
    expect(date).toContain('/ - . ,');
    const time = told({ kind: 'time', pattern: 'dd/mm/yyyy' });
    expect(time).toContain("a time format's pattern is a time and nothing else");
    expect(time).toContain('then :MM');
    // No group a pattern doesn't have, and no colon as a separator.
    for (const message of [date, time]) {
      expect(message).not.toMatch(/\bM\b/);
      expect(message).not.toContain(', :');
      expect(message).not.toContain('. , :');
    }
    expect(time).not.toContain('yyyy');
  });

  test('a format goes on a text field and a dropdown, and not beside its own scripts', () => {
    const date = { kind: 'date', pattern: 'dd/mm/yyyy' } as const;
    expect(takesFormat('text')).toBe(true);
    expect(takesFormat('combobox')).toBe(true);
    expect(takesFormat('listbox')).toBe(false);
    expect(formatWriteOf({}, 'text')).toBe(undefined);
    expect(formatWriteOf({}, 'checkbox')).toBe(undefined);
    expect(formatWriteOf({ format: date }, 'text')).toEqual(date);
    expect(formatWriteOf({ format: null }, 'combobox')).toBe(null);
    const invalid = (field: string) => ({ code: EngineErrorCode.InvalidArg, field });
    for (const kind of ['checkbox', 'radio', 'listbox', 'pushbutton', 'signature'] as const) {
      expect(refusal(() => formatWriteOf({ format: date }, kind))).toEqual(invalid('format'));
      expect(refusal(() => formatWriteOf({ format: null }, kind))).toEqual(invalid('format'));
    }
    const script = { type: 'javascript', script: 'event.rc = true;' } as const;
    const beside = (patch: FieldActionsPatch) => () =>
      formatWriteOf({ format: date, actions: patch }, 'text');
    expect(refusal(beside({ format: script }))).toEqual(invalid('actions.format'));
    expect(refusal(beside({ keystroke: script }))).toEqual(invalid('actions.keystroke'));
    expect(refusal(beside({ keystroke: null }))).toEqual(invalid('actions.keystroke'));
    expect(beside({ validate: script, calculate: null })()).toEqual(date);
  });

  test('two formats are the same by kind and pattern', () => {
    const date = { kind: 'date', pattern: 'm/d' } as const;
    expect(formatsEqual(null, null)).toBe(true);
    expect(formatsEqual(date, { kind: 'date', pattern: 'm/d' })).toBe(true);
    expect(formatsEqual({ kind: 'other' }, { kind: 'other' })).toBe(true);
    expect(formatsEqual(date, null)).toBe(false);
    expect(formatsEqual(null, date)).toBe(false);
    expect(formatsEqual(date, { kind: 'time', pattern: 'm/d' })).toBe(false);
    expect(formatsEqual(date, { kind: 'date', pattern: 'm/d/yy' })).toBe(false);
    expect(formatsEqual(date, { kind: 'other' })).toBe(false);
  });
});

describe("a field's purpose", () => {
  test('a purpose is 1 to 256 characters with no space at either end and no NUL', () => {
    for (const purpose of [
      'name',
      'date-signed',
      'acme:po number',
      'p'.repeat(256),
      'naïve',
      '署名',
      // Any other character is kept as it is, a line break inside included.
      'two\nlines',
      'a(b)\\c',
    ]) {
      expect(isFieldPurpose(purpose), purpose).toBe(true);
      expect(checkedPurpose(purpose)).toBe(purpose);
    }
    for (const purpose of [
      '',
      ' ',
      ' name',
      'name ',
      'name\n',
      '\tname',
      'p'.repeat(257),
      // A NUL would cut the purpose short where it is stored.
      'billing\u0000account',
      '\u0000',
      'name\u0000',
      5,
      {},
    ]) {
      expect(isFieldPurpose(purpose), String(purpose)).toBe(false);
      expect(refusal(() => checkedPurpose(purpose))).toEqual({
        code: EngineErrorCode.InvalidArg,
        field: 'purpose',
      });
    }
  });

  test('left out or null is no purpose', () => {
    expect(checkedPurpose(undefined)).toBe(null);
    expect(checkedPurpose(null)).toBe(null);
    expect(isFieldPurpose(null)).toBe(false);
  });
});
