import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

import {
  PRELUDE_SOURCE,
  type AcroJsVmGlobal,
  type ScriptFieldInput,
  type ScriptInput,
  type ScriptOutput,
} from '../src';

const ref = (name: string) => ({ kind: 'fqn' as const, name });

const field = (
  name: string,
  value: string,
  overrides: Partial<ScriptFieldInput> = {},
): ScriptFieldInput => ({
  ref: ref(name),
  name,
  family: 'text',
  value,
  defaultValue: value,
  display: 'visible',
  readOnly: false,
  required: false,
  ...overrides,
});

const input = (fields: ScriptFieldInput[], event: ScriptInput['event']): ScriptInput => ({
  document: { id: 'doc-af', fileName: 'af.pdf', pageCount: 1, pageNumber: 0 },
  identity: { name: 'Alex Morgan', loginName: 'alex', corporation: 'EmbedPDF', email: '' },
  environment: {
    nowMs: Date.UTC(2026, 6, 15, 9, 30, 0),
    utcOffsetMinutes: 180,
    randomSeed: 7,
  },
  fields,
  event,
});

function createVm(): AcroJsVmGlobal {
  const context = createContext({});
  runInContext(PRELUDE_SOURCE, context);
  return context as unknown as AcroJsVmGlobal;
}

const plain = (output: ScriptOutput): ScriptOutput => JSON.parse(JSON.stringify(output));

/** Run one commit-shaped keystroke event (Acrobat: full value, empty change). */
function commitKeystroke(source: string, value: string): ScriptOutput {
  const vm = createVm();
  return plain(
    vm.__acrojsRun(
      source,
      input([field('price', '')], {
        kind: 'field-keystroke',
        target: ref('price'),
        source: ref('price'),
        value,
        change: '',
        selStart: 0,
        selEnd: 0,
        willCommit: true,
      }),
    ),
  );
}

function formatEvent(source: string, value: string): ScriptOutput {
  const vm = createVm();
  return plain(
    vm.__acrojsRun(
      source,
      input([field('price', value)], {
        kind: 'field-format',
        target: ref('price'),
        value,
      }),
    ),
  );
}

function validateEvent(source: string, value: string): ScriptOutput {
  const vm = createVm();
  return plain(
    vm.__acrojsRun(
      source,
      input([field('qty', '')], {
        kind: 'field-validate',
        target: ref('qty'),
        value,
        willCommit: true,
      }),
    ),
  );
}

describe('AF number helpers', () => {
  it('AFNumber_Keystroke accepts numeric commits, including separators', () => {
    for (const value of ['12', '1,234.56', '-3.5', '.5', '']) {
      const output = commitKeystroke(`AFNumber_Keystroke(2, 0, 0, 0, "", true);`, value);
      expect(output.event.rc).toBe(true);
      expect(output.uiEffects).toEqual([]);
    }
  });

  it('AFNumber_Keystroke rejects a non-numeric commit with the Acrobat alert', () => {
    const output = commitKeystroke(`AFNumber_Keystroke(2, 0, 0, 0, "", true);`, 'abc');
    expect(output.event.rc).toBe(false);
    expect(output.uiEffects).toEqual([
      {
        kind: 'alert',
        message: 'The value entered does not match the format of the field [ price ]',
        icon: 0,
      },
    ]);
  });

  it('AFNumber_Keystroke honors the decimal-comma separator styles', () => {
    expect(commitKeystroke(`AFNumber_Keystroke(2, 2, 0, 0, "", true);`, '1.234,56').event.rc).toBe(
      true,
    );
    expect(commitKeystroke(`AFNumber_Keystroke(2, 2, 0, 0, "", true);`, '1,234.56').event.rc).toBe(
      false,
    );
  });

  it('AFNumber_Keystroke strips the configured currency before validating', () => {
    const output = commitKeystroke(`AFNumber_Keystroke(2, 0, 0, 0, "€", true);`, '€ 12');
    expect(output.event.rc).toBe(true);
  });

  it('AFPercent_Keystroke tolerates a trailing percent sign', () => {
    expect(commitKeystroke(`AFPercent_Keystroke(2, 0);`, '50%').event.rc).toBe(true);
    expect(commitKeystroke(`AFPercent_Keystroke(2, 0);`, 'x').event.rc).toBe(false);
  });

  it('AFMergeChange splices typing events and passes commits through', () => {
    const vm = createVm();
    const typing = plain(
      vm.__acrojsRun(
        `event.value = AFMergeChange(event);`,
        input([field('price', 'abcd')], {
          kind: 'field-keystroke',
          target: ref('price'),
          value: 'abcd',
          change: 'XY',
          selStart: 1,
          selEnd: 3,
          willCommit: false,
        }),
      ),
    );
    expect(typing.event.value).toBe('aXYd');
    const commit = commitKeystroke(`event.value = AFMergeChange(event);`, 'whole');
    expect(commit.event.value).toBe('whole');
  });

  it('AFMakeNumber parses US, European, and plain formats — and refuses junk', () => {
    const output = formatEvent(
      `event.value = [
         AFMakeNumber('$ 1,234.56'),
         AFMakeNumber('1.234,56'),
         AFMakeNumber('12,5'),
         AFMakeNumber('7'),
         AFMakeNumber('abc'),
         AFMakeNumber(''),
       ].map(String).join('|');`,
      '',
    );
    expect(output.event.value).toBe('1234.56|1234.56|12.5|7|null|null');
  });

  it('AFExtractNums pulls digit groups and returns null when none exist', () => {
    const output = formatEvent(
      `var a = AFExtractNums('12 of 34'); var b = AFExtractNums('abc');
       event.value = a.join(',') + '|' + String(b);`,
      '',
    );
    expect(output.event.value).toBe('12,34|null');
  });
});

describe('AF special and range helpers', () => {
  it('AFSpecial_Format formats SSN and phone numbers from digits', () => {
    expect(formatEvent(`AFSpecial_Format(3);`, '123456789').event.value).toBe('123-45-6789');
    expect(formatEvent(`AFSpecial_Format(2);`, '1234567890').event.value).toBe('(123) 456-7890');
    expect(formatEvent(`AFSpecial_Format(2);`, '1234567').event.value).toBe('123-4567');
    expect(formatEvent(`AFSpecial_Format(1);`, '123456789').event.value).toBe('12345-6789');
  });

  it('AFSpecial_Keystroke validates digit counts on commit', () => {
    expect(commitKeystroke(`AFSpecial_Keystroke(0);`, '12345').event.rc).toBe(true);
    expect(commitKeystroke(`AFSpecial_Keystroke(0);`, '1234').event.rc).toBe(false);
    expect(commitKeystroke(`AFSpecial_Keystroke(2);`, '(123) 456-7890').event.rc).toBe(true);
  });

  it('AFRange_Validate rejects out-of-range values with the Acrobat message', () => {
    const bad = validateEvent(`AFRange_Validate(true, 0, true, 100);`, '150');
    expect(bad.event.rc).toBe(false);
    expect(bad.uiEffects[0]).toMatchObject({
      kind: 'alert',
      message: 'Invalid value: must be greater than or equal to 0 and less than or equal to 100.',
    });
    expect(validateEvent(`AFRange_Validate(true, 0, true, 100);`, '50').event.rc).toBe(true);
    expect(validateEvent(`AFRange_Validate(true, 10, false, 0);`, '50').event.rc).toBe(true);
    expect(
      validateEvent(`AFRange_Validate(true, 10, false, 0);`, '5').uiEffects[0],
    ).toMatchObject({ message: 'Invalid value: must be greater than or equal to 10.' });
  });
});

describe('AF date and time helpers', () => {
  it('AFDate_KeystrokeEx accepts parseable dates and rejects impossible ones', () => {
    expect(commitKeystroke(`AFDate_KeystrokeEx('mm/dd/yy');`, '07/15/26').event.rc).toBe(true);
    expect(commitKeystroke(`AFDate_KeystrokeEx('dd-mm-yy');`, '31-12-26').event.rc).toBe(true);
    const bad = commitKeystroke(`AFDate_KeystrokeEx('mm/dd/yy');`, '13/45/26');
    expect(bad.event.rc).toBe(false);
    expect(bad.uiEffects[0]).toMatchObject({
      kind: 'alert',
      message:
        'Invalid date/time: please ensure that the date/time exists. Field [ price ] should match format mm/dd/yy',
    });
    expect(commitKeystroke(`AFDate_Keystroke(2);`, '02/30/26').event.rc).toBe(false);
  });

  it('AFDate_FormatEx formats via the lenient parser when native parsing fails', () => {
    expect(formatEvent(`AFDate_FormatEx('dd-mm-yyyy');`, '31-12-2026').event.value).toBe(
      '31-12-2026',
    );
    // Unparsable input leaves the value untouched instead of emitting NaN text.
    expect(formatEvent(`AFDate_FormatEx('mm/dd/yy');`, 'not a date').event.value).toBe(
      'not a date',
    );
    expect(formatEvent(`AFDate_FormatEx('mm/dd/yy');`, '').event.value).toBe('');
  });

  it('AFTime_Format renders 12-hour and 24-hour clocks deterministically', () => {
    expect(formatEvent(`AFTime_Format(1);`, '13:45').event.value).toBe('1:45 pm');
    expect(formatEvent(`AFTime_Format(0);`, '9:05 am').event.value).toBe('09:05');
    expect(formatEvent(`AFTime_Format(3);`, '00:07:09').event.value).toBe('12:07:09 am');
  });

  it('AFTime_Keystroke rejects impossible times', () => {
    expect(commitKeystroke(`AFTime_Keystroke(0);`, '25:99').event.rc).toBe(false);
    expect(commitKeystroke(`AFTime_Keystroke(0);`, '23:59').event.rc).toBe(true);
  });

  it('util.printd understands the new 12-hour tokens', () => {
    // nowMs is 09:30 UTC with a +180 minute offset → 12:30 local.
    const output = formatEvent(`event.value = util.printd('hh:MM tt', new Date());`, '');
    expect(output.event.value).toBe('12:30 pm');
  });
});
