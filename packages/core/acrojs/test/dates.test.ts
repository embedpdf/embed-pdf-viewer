import { createContext, runInContext } from 'node:vm';
import {
  isDatePattern,
  isTimePattern,
  scriptsOfFormat,
  STANDARD_DATE_PATTERNS,
  STANDARD_TIME_PATTERNS,
  type FormFieldFormatWritable,
} from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import {
  formatDate,
  installAcroJs,
  parseDate,
  PRELUDE_SOURCE,
  type AcroJsVmGlobal,
  type DateParts,
  type ScriptInput,
  type ScriptOutput,
} from '../src';

const ref = { kind: 'fqn' as const, name: 'when' };

/** An event on a field holding `value`: 09:30 UTC on 15 July 2026, shown `offset` minutes ahead. */
const input = (event: Partial<ScriptInput['event']>, value: string, offset = 180): ScriptInput => ({
  document: { id: 'doc-dates', fileName: 'dates.pdf', pageCount: 1, pageNumber: 0 },
  identity: { name: 'Alex Morgan', loginName: 'alex', corporation: 'EmbedPDF', email: '' },
  environment: { nowMs: Date.UTC(2026, 6, 15, 9, 30, 0), utcOffsetMinutes: offset, randomSeed: 7 },
  fields: [
    {
      ref,
      name: 'when',
      kind: 'text',
      value,
      defaultValue: '',
      display: 'visible',
      readOnly: false,
      required: false,
    },
  ],
  event: { kind: 'field-format', target: ref, value, ...event } as ScriptInput['event'],
});

/** A sandbox's own realm, with the prelude in it as a sandbox gets it. */
function realm(): AcroJsVmGlobal {
  const context = createContext({});
  runInContext(PRELUDE_SOURCE, context);
  return context as unknown as AcroJsVmGlobal;
}

const run = (vm: AcroJsVmGlobal, source: string, args: ScriptInput): ScriptOutput =>
  JSON.parse(JSON.stringify(vm.__acrojsRun(source, args))) as ScriptOutput;

/** What a format script leaves as the field's text. */
const formatted = (source: string, value: string): unknown =>
  run(realm(), source, input({}, value)).event.value;

/** Whether a keystroke script takes `value` when the field is left. */
const accepted = (vm: AcroJsVmGlobal, source: string, value: string): boolean =>
  run(
    vm,
    source,
    input(
      {
        kind: 'field-keystroke',
        source: ref,
        change: '',
        selStart: 0,
        selEnd: 0,
        willCommit: true,
      },
      value,
    ),
  ).event.rc !== false;

/** The scripts' today: 12:30 on 15 July 2026, three hours ahead of UTC. */
const TODAY = { year: 2026, month: 7, day: 15 };
const MOMENT: DateParts = { year: 2026, month: 3, day: 5, hour: 14, minute: 7, second: 9 };

describe('formatDate', () => {
  it('writes a date as each letter group shows it', () => {
    const shown: Record<string, string> = {
      yyyy: '2026',
      yy: '26',
      mmmm: 'March',
      mmm: 'Mar',
      mm: '03',
      m: '3',
      dd: '05',
      d: '5',
      HH: '14',
      H: '14',
      hh: '02',
      h: '2',
      MM: '07',
      M: '7',
      ss: '09',
      tt: 'pm',
    };
    for (const [group, text] of Object.entries(shown)) {
      expect(formatDate(MOMENT, group), group).toBe(text);
    }
    expect(formatDate(MOMENT, 'dd/mm/yyyy')).toBe('05/03/2026');
    expect(formatDate(MOMENT, 'mmmm d, yyyy')).toBe('March 5, 2026');
    expect(formatDate(MOMENT, 'm/d/yy h:MM tt')).toBe('3/5/26 2:07 pm');
  });

  it('takes a day with no time of day as midnight', () => {
    const day = { year: 2026, month: 11, day: 24 };
    expect(formatDate(day, 'dd/mm/yyyy HH:MM:ss')).toBe('24/11/2026 00:00:00');
    expect(formatDate(day, 'h:MM tt')).toBe('12:00 am');
    expect(formatDate({ ...day, hour: 12 }, 'h:MM tt')).toBe('12:00 pm');
  });

  it('writes the parts it is given, whatever zone the machine is in', () => {
    // The last and the first moment of a day: neither slides into the next or the last one.
    expect(formatDate({ ...MOMENT, hour: 23, minute: 59, second: 59 }, 'yyyy-mm-dd HH:MM:ss')).toBe(
      '2026-03-05 23:59:59',
    );
    expect(formatDate({ ...MOMENT, hour: 0, minute: 0, second: 0 }, 'yyyy-mm-dd HH:MM:ss')).toBe(
      '2026-03-05 00:00:00',
    );
    expect(formatDate({ year: 1999, month: 12, day: 31 }, 'd/m/yyyy')).toBe('31/12/1999');
    expect(formatDate({ year: 85, month: 1, day: 1 }, 'yyyy')).toBe('85');
  });

  it('writes what a format script writes for the same moment', () => {
    for (const pattern of [...STANDARD_DATE_PATTERNS, ...STANDARD_TIME_PATTERNS, 'dd.mm.yyyy']) {
      const byScript = formatted(
        `event.value = util.printd(${JSON.stringify(pattern)}, new Date());`,
        '',
      );
      expect(formatDate({ ...TODAY, hour: 12, minute: 30 }, pattern), pattern).toBe(byScript);
    }
  });
});

describe('parseDate', () => {
  const day = (year: number, month: number, date: number): DateParts => ({
    year,
    month,
    day: date,
    hour: 0,
    minute: 0,
    second: 0,
  });

  it('reads text as a person types it, in the order the pattern has', () => {
    expect(parseDate('05/03/2026', 'dd/mm/yyyy', TODAY)).toEqual(day(2026, 3, 5));
    expect(parseDate('05/03/2026', 'mm/dd/yyyy', TODAY)).toEqual(day(2026, 5, 3));
    expect(parseDate('5.3.26', 'dd/mm/yyyy', TODAY)).toEqual(day(2026, 3, 5));
    expect(parseDate('5/3/75', 'dd/mm/yyyy', TODAY)).toEqual(day(1975, 3, 5));
    expect(parseDate('2026-03-05', 'yyyy-mm-dd', TODAY)).toEqual(day(2026, 3, 5));
    expect(parseDate('Mar 5, 2026', 'mmm d, yyyy', TODAY)).toEqual(day(2026, 3, 5));
    expect(parseDate('5 march 2026', 'd mmmm yyyy', TODAY)).toEqual(day(2026, 3, 5));
    expect(parseDate('  05/03/2026 ', 'dd/mm/yyyy', TODAY)).toEqual(day(2026, 3, 5));
  });

  it('takes the year and the month the text leaves out from today, and the first for the day', () => {
    expect(parseDate('5/3', 'd/m', TODAY)).toEqual(day(2026, 3, 5));
    expect(parseDate('5/3', 'd/m', { year: 2031, month: 1, day: 1 })).toEqual(day(2031, 3, 5));
    expect(parseDate('03/27', 'mm/yy', TODAY)).toEqual(day(2027, 3, 1));
    expect(parseDate('9', 'dd', TODAY)).toEqual(day(2026, 7, 9));
    expect(parseDate('9', 'dd', { year: 2024, month: 2, day: 20 })).toEqual(day(2024, 2, 9));
  });

  it('reads a time of day with or without its half of the day', () => {
    const at = (hour: number, minute: number, second = 0): DateParts => ({
      ...day(2026, 7, 1),
      hour,
      minute,
      second,
    });
    expect(parseDate('14:07', 'HH:MM', TODAY)).toEqual(at(14, 7));
    expect(parseDate('2:07 pm', 'h:MM tt', TODAY)).toEqual(at(14, 7));
    expect(parseDate('12:00 am', 'h:MM tt', TODAY)).toEqual(at(0, 0));
    expect(parseDate('14:07:09', 'HH:MM:ss', TODAY)).toEqual(at(14, 7, 9));
    expect(parseDate('3/5/26 14:07', 'm/d/yy HH:MM', TODAY)).toEqual({
      ...day(2026, 3, 5),
      hour: 14,
      minute: 7,
    });
  });

  it('gives null for text that says no date', () => {
    for (const text of ['', '   ', 'soon', '31/02/2026', '32/01/2026', '5/13/2026', '25:00']) {
      expect(parseDate(text, 'dd/mm/yyyy', TODAY), text).toBe(null);
    }
    expect(parseDate('29/02/2024', 'dd/mm/yyyy', TODAY)).toEqual(day(2024, 2, 29));
    expect(parseDate('29/02/2026', 'dd/mm/yyyy', TODAY)).toBe(null);
  });

  it("doesn't fall back to JavaScript's own date parsing, as a format script does", () => {
    // The format script reads an ISO date the pattern can't, through `Date`.
    expect(formatted('AFDate_FormatEx("dd/mm/yyyy");', '2026-03-05')).toBe('05/03/2026');
    // The keystroke script refuses it, and so does this.
    expect(accepted(realm(), 'AFDate_KeystrokeEx("dd/mm/yyyy");', '2026-03-05')).toBe(false);
    expect(parseDate('2026-03-05', 'dd/mm/yyyy', TODAY)).toBe(null);
    expect(parseDate('2026-03-05T09:30:00Z', 'dd/mm/yyyy', TODAY)).toBe(null);
  });

  it('reads a text exactly when the keystroke script takes it', () => {
    const patterns = [
      ...STANDARD_DATE_PATTERNS,
      ...STANDARD_TIME_PATTERNS,
      'dd/mm/yyyy',
      'yyyy-mm-dd',
      'dd.mm.yyyy',
      'd mmmm yyyy',
      'hh:MM tt',
    ];
    const texts = [
      '5/3/26',
      '05/03/2026',
      '2026-03-05',
      '31/12/1999',
      '12/31/1999',
      '29/02/2024',
      '29/02/2023',
      '31/04/2026',
      '5 Mar 2026',
      'March 5, 2026',
      'mar-26',
      '5-mar',
      'Sept 3 2020',
      '13:45',
      '1:45 pm',
      '12:00 am',
      '25:00',
      '9:61',
      '09:07:09',
      '3/5/26 2:07 pm',
      '3/5/26 14:07',
      '2026',
      '26',
      '5',
      '5/3',
      '0',
      '00/00/0000',
      '31/31/31',
      'soon',
      '7.4.1976',
      '2026-07-15T09:30:00Z',
      'July 4, 1976 13:00',
      '-5/3/2026',
    ];
    const vm = realm();
    let compared = 0;
    for (const pattern of patterns) {
      const keystroke = `AFDate_KeystrokeEx(${JSON.stringify(pattern)});`;
      for (const text of texts) {
        expect(parseDate(text, pattern, TODAY) !== null, `${pattern} <- ${text}`).toBe(
          accepted(vm, keystroke, text),
        );
        compared += 1;
      }
    }
    expect(compared).toBe(patterns.length * texts.length);
    // An empty field is the one difference: the script lets it through, and it says no date.
    expect(accepted(vm, 'AFDate_KeystrokeEx("dd/mm/yyyy");', '')).toBe(true);
    expect(parseDate('', 'dd/mm/yyyy', TODAY)).toBe(null);
  });

  it('gives the same parts as the sandbox does, in a realm of its own', () => {
    const vm = realm();
    for (const [text, pattern] of [
      ['5/3/26', 'dd/mm/yyyy'],
      ['Mar 5, 2026 2:07 pm', 'mmm d, yyyy h:MM tt'],
      ['soon', 'dd/mm/yyyy'],
    ] as const) {
      const inSandbox = JSON.parse(JSON.stringify(vm.__acrojsParseDate(text, pattern, TODAY)));
      expect(parseDate(text, pattern, TODAY)).toEqual(inSandbox);
    }
  });
});

/** Every pattern of a family wide enough to hold what people write and what breaks. */
function patternFamily(): string[] {
  const joins = ['/', '-', '.', ' ', ', ', '', ':', ': '];
  const kinds: Record<string, string[]> = {
    d: ['d', 'dd'],
    m: ['m', 'mm', 'mmm', 'mmmm'],
    y: ['yy', 'yyyy'],
  };
  const dates = new Set<string>();
  const orders = ['dmy', 'mdy', 'ymd', 'ydm', 'dm', 'md', 'my', 'ym', 'dy', 'd', 'm', 'y'];
  for (const order of orders) {
    const build = (at: number, soFar: string): void => {
      if (at === order.length) {
        dates.add(soFar);
        return;
      }
      for (const group of kinds[order[at]]) {
        if (at === 0) build(at + 1, group);
        else for (const join of joins) build(at + 1, soFar + join + group);
      }
    };
    build(0, '');
  }
  const times = new Set<string>();
  for (const hour of ['HH', 'H', 'hh', 'h']) {
    for (const join of [':', '.', ' ', '']) {
      for (const minute of ['MM', 'M']) {
        for (const seconds of ['', `${join}ss`]) {
          for (const half of ['', ' tt', 'tt']) times.add(hour + join + minute + seconds + half);
        }
      }
    }
  }
  const odd = ['tt h:MM', 'MM:HH', 'HH', 'MM', 'ss', 'tt', 'h tt', 'HH:MM - HH:MM', 'ss:MM:HH'];
  for (const pattern of odd) times.add(pattern);
  const some = (set: Set<string>, every: number) => [...set].filter((_, at) => at % every === 0);
  const all = new Set<string>([...dates, ...times]);
  for (const date of some(dates, 23)) {
    for (const time of some(times, 5)) {
      all.add(`${date} ${time}`);
      all.add(`${time} ${date}`);
      all.add(date + time);
      all.add(`${date}, ${time}`);
    }
  }
  return [...all];
}

/** Whether `read` is `date` on the parts `pattern` carries. */
function sameOnWhatItCarries(pattern: string, date: DateParts, read: DateParts | null): boolean {
  if (!read) return false;
  const has = (group: RegExp) => group.test(pattern);
  // Two digits of a year carry its last two; twelve hours with no half of the day, the hour of twelve.
  if (has(/yyyy/) && read.year !== date.year) return false;
  if (!has(/yyyy/) && has(/yy/) && read.year % 100 !== date.year % 100) return false;
  if (has(/m/) && read.month !== date.month) return false;
  if (has(/d/) && read.day !== date.day) return false;
  if (has(/H/) && read.hour !== date.hour) return false;
  if (has(/h/) && has(/tt/) && read.hour !== date.hour) return false;
  if (has(/h/) && !has(/tt/) && read.hour % 12 !== date.hour % 12) return false;
  if (has(/M/) && read.minute !== date.minute) return false;
  if (has(/ss/) && read.second !== date.second) return false;
  return true;
}

describe('a pattern the engine takes', () => {
  const SAMPLES: DateParts[] = [
    MOMENT,
    { year: 1999, month: 12, day: 31, hour: 23, minute: 59, second: 58 },
    { year: 2024, month: 2, day: 29, hour: 0, minute: 0, second: 0 },
    { year: 2031, month: 11, day: 9, hour: 9, minute: 5, second: 30 },
    { year: 2026, month: 5, day: 17, hour: 12, minute: 30, second: 0 },
  ];
  /** Whether a date written by `pattern` reads back as itself, on what the pattern carries. */
  const readsBack = (pattern: string): boolean =>
    SAMPLES.every((date) =>
      sameOnWhatItCarries(pattern, date, parseDate(formatDate(date, pattern), pattern, date)),
    );
  const family = patternFamily();
  /** Every format of the family a write takes: a date by a date's pattern, a time by a time's. */
  const dates = family.filter((pattern) => isDatePattern(pattern));
  const times = family.filter((pattern) => isTimePattern(pattern));
  const formats: FormFieldFormatWritable[] = [
    ...dates.map((pattern) => ({ kind: 'date' as const, pattern })),
    ...times.map((pattern) => ({ kind: 'time' as const, pattern })),
  ];
  /** The script a format write gives the field for `event`. */
  const written = (format: FormFieldFormatWritable, event: 'format' | 'keystroke'): string => {
    const script = scriptsOfFormat(format)[event];
    if (!script) throw new Error(`a ${format.kind} format writes a ${event} script`);
    return script.script;
  };
  /** An event on a field holding `value`, run at noon on `day`. */
  const on = (day: DateParts, event: Partial<ScriptInput['event']>, value: string): ScriptInput => {
    const args = input(event, value, 0);
    args.environment.nowMs = Date.UTC(day.year, day.month - 1, day.day, 12);
    return args;
  };
  const LEAVING = {
    kind: 'field-keystroke',
    source: ref,
    change: '',
    selStart: 0,
    selEnd: 0,
    willCommit: true,
  } as const;

  it('reads back what it writes, for every pattern of a wide family', () => {
    expect(dates.filter((pattern) => !readsBack(pattern))).toEqual([]);
    expect(times.filter((pattern) => !readsBack(pattern))).toEqual([]);
    expect(family.length).toBeGreaterThan(30_000);
    expect(dates.length).toBeGreaterThan(3_000);
    expect(times).toHaveLength(24);
  });

  it('reads back what it writes, for patterns made at random', () => {
    // A family written by hand holds what its author thought of. This one
    // strings groups, separators and a time together by chance, so it holds
    // the rest: a part of the date written twice, a time in the middle.
    let state = 20261124;
    const random = (): number => {
      state = (state + 0x6d2b79f5) >>> 0;
      let mixed = state;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
    const groups = ['yyyy', 'yy', 'mmmm', 'mmm', 'mm', 'm', 'dd', 'd'];
    const between = [' ', '/', '-', '.', ',', ', ', ' - ', '  ', '. ', ''];
    const timesOfDay = ['HH:MM', 'H:MM', 'hh:MM tt', 'h:MM tt', 'HH:MM:ss', 'h:MM:sstt'];
    const made = new Set<string>();
    for (let round = 0; round < 60_000; round++) {
      const count = 1 + Math.floor(random() * 5);
      const timeAt = random() < 1 / 3 ? Math.floor(random() * (count + 1)) : -1;
      const tokens: string[] = [];
      for (let at = 0; at <= count; at++) {
        if (at === timeAt) tokens.push(pick(timesOfDay), pick(between));
        if (at < count) tokens.push(pick(groups), pick(between));
      }
      made.add(tokens.slice(0, -1).join(''));
    }
    const takenAtRandom = [...made].filter((pattern) => isDatePattern(pattern));
    expect(takenAtRandom.filter((pattern) => !readsBack(pattern))).toEqual([]);
    // Enough of both kinds were made for the check to mean something.
    expect(takenAtRandom.length).toBeGreaterThan(2_000);
    expect(made.size - takenAtRandom.length).toBeGreaterThan(20_000);
  });

  it('takes no pattern that writes a part of the date twice', () => {
    for (const pattern of ['yyyy/mm/mm/dd', 'dd/dd/mm/yyyy', 'yyyy-yy-mm-dd', 'mmm mm d']) {
      expect(isDatePattern(pattern), pattern).toBe(false);
      expect(readsBack(pattern), pattern).toBe(false);
    }
    // 24 November reads back as the 11th: the month's second writing is taken for the day.
    const day = { year: 2026, month: 11, day: 24 };
    expect(formatDate(day, 'yyyy/mm/mm/dd')).toBe('2026/11/11/24');
    expect(parseDate('2026/11/11/24', 'yyyy/mm/mm/dd', day)).toMatchObject({ month: 11, day: 11 });
  });

  it('is a date or a time, never both', () => {
    expect(dates.filter((pattern) => isTimePattern(pattern))).toEqual([]);
    for (const pattern of STANDARD_DATE_PATTERNS) {
      expect([isDatePattern(pattern), isTimePattern(pattern)], pattern).toEqual([true, false]);
      expect(readsBack(pattern), pattern).toBe(true);
    }
    for (const pattern of STANDARD_TIME_PATTERNS) {
      expect([isDatePattern(pattern), isTimePattern(pattern)], pattern).toEqual([false, true]);
      expect(readsBack(pattern), pattern).toBe(true);
    }
  });

  it('leaves out the patterns whose own writing does not read back', () => {
    // Digits that touch read as one number; a time reads with colons, hours first.
    for (const pattern of [
      'yyyymmdd',
      'ddmmyyyy',
      'HH.MM.ss',
      'H:M',
      'HH MM',
      'HHMM',
      'MM:HH',
      'tt h:MM',
      'h tt',
      'ss',
      'dd:mm:yyyy',
    ]) {
      expect(isDatePattern(pattern), pattern).toBe(false);
      expect(isTimePattern(pattern), pattern).toBe(false);
      expect(readsBack(pattern), pattern).toBe(false);
    }
  });

  it('is taken by the keystroke script the engine writes, for what its format script shows', () => {
    const vm = realm();
    const refused: string[] = [];
    let checked = 0;
    for (const format of formats) {
      const keystroke = written(format, 'keystroke');
      for (const day of SAMPLES) {
        const shown = formatDate(day, format.pattern);
        const output = run(vm, keystroke, on(day, LEAVING, shown));
        if (output.event.rc === false) {
          refused.push(`${format.kind} ${format.pattern}: ${keystroke} refuses ${shown}`);
        }
        checked += 1;
      }
    }
    expect(refused).toEqual([]);
    expect(checked).toBe(formats.length * SAMPLES.length);
  });

  it('is shown by the format script the engine writes as the same text again', () => {
    // The text a field shows goes through its format script when the field
    // is left: the script reads its own writing, and writes it unchanged.
    const vm = realm();
    const changed: string[] = [];
    for (const format of formats.filter((_, at) => at % 7 === 0)) {
      const script = written(format, 'format');
      for (const day of SAMPLES) {
        const shown = formatDate(day, format.pattern);
        const again = run(vm, script, on(day, {}, shown)).event.value;
        if (again !== shown) changed.push(`${format.kind} ${format.pattern}: ${shown} -> ${again}`);
      }
    }
    expect(changed).toEqual([]);
  });

  it('refuses a pattern of the other kind, whose keystroke script would refuse what it shows', () => {
    const vm = realm();
    // A time's keystroke script reads a time: a date in digits is none.
    for (const pattern of ['dd/mm/yyyy', 'yyyy', 'm/d', 'yy-mm-dd']) {
      expect(isTimePattern(pattern), pattern).toBe(false);
      const asTime = { kind: 'time' as const, pattern };
      const shown = formatDate(MOMENT, pattern);
      expect(accepted(vm, written(asTime, 'keystroke'), shown), `${pattern} -> ${shown}`).toBe(
        false,
      );
    }
    // A time alone is a time's pattern, and a date's keystroke script is not written for it.
    for (const pattern of STANDARD_TIME_PATTERNS) {
      expect(isDatePattern(pattern), pattern).toBe(false);
    }
  });
});

describe("the prelude's lists of patterns and the engine's", () => {
  const SAMPLES = ['7/15/26', '12/31/1999 23:59', '2/29/2024 1:05 pm', '1/2/03'];

  it('name the same date pattern by each number', () => {
    STANDARD_DATE_PATTERNS.forEach((pattern, index) => {
      for (const value of SAMPLES) {
        expect(formatted(`AFDate_Format(${index});`, value), `${index}: ${value}`).toBe(
          formatted(`AFDate_FormatEx(${JSON.stringify(pattern)});`, value),
        );
      }
    });
  });

  it('name the same time pattern by each number', () => {
    STANDARD_TIME_PATTERNS.forEach((pattern, index) => {
      for (const value of ['13:45', '9:05 am', '00:07:09', '12:00 pm']) {
        expect(formatted(`AFTime_Format(${index});`, value), `${index}: ${value}`).toBe(
          formatted(`AFTime_FormatEx(${JSON.stringify(pattern)});`, value),
        );
      }
    });
  });

  it('are as long as each other', () => {
    // Past its last pattern the prelude falls back to one that prints
    // differently from the list's last, so one more entry on either side shows.
    const value = '7/15/26 14:07:09';
    const past = formatted(`AFDate_Format(${STANDARD_DATE_PATTERNS.length});`, value);
    expect(past).toBe(formatted('AFDate_FormatEx("m/d/yy");', value));
    expect(past).not.toBe(formatted(`AFDate_Format(${STANDARD_DATE_PATTERNS.length - 1});`, value));
    const pastTime = formatted(`AFTime_Format(${STANDARD_TIME_PATTERNS.length});`, value);
    expect(pastTime).toBe(formatted('AFTime_FormatEx("HH:MM");', value));
    expect(pastTime).not.toBe(
      formatted(`AFTime_Format(${STANDARD_TIME_PATTERNS.length - 1});`, value),
    );
    expect([STANDARD_DATE_PATTERNS.length, STANDARD_TIME_PATTERNS.length]).toEqual([14, 4]);
  });
});

describe('the prelude, outside a sandbox', () => {
  it('is the whole source a sandbox runs, on its own', () => {
    expect(PRELUDE_SOURCE).toBe(`(${installAcroJs.toString()})(globalThis);`);
  });

  it('runs no script and leaves the page as it was', () => {
    const before = Object.getOwnPropertyNames(globalThis).sort();
    const date = Date;
    formatDate(MOMENT, 'dd/mm/yyyy');
    parseDate('05/03/2026', 'dd/mm/yyyy', TODAY);
    expect(Object.getOwnPropertyNames(globalThis).sort()).toEqual(before);
    expect(Date).toBe(date);
  });
});

describe('the date entry a sandbox installs', () => {
  it('reads no run and no environment: the same answer before, during and after one', () => {
    const vm = realm();
    const read = () => JSON.stringify(vm.__acrojsParseDate('5/3', 'd/m', TODAY));
    const before = read();
    expect(before).toBe(
      JSON.stringify({ ...TODAY, month: 3, day: 5, hour: 0, minute: 0, second: 0 }),
    );
    // A run whose own today is another year, shown in another zone.
    const elsewhere = input({}, '');
    elsewhere.environment = { nowMs: Date.UTC(1999, 0, 1), utcOffsetMinutes: -480, randomSeed: 1 };
    const during = run(
      vm,
      `event.value = JSON.stringify(__acrojsParseDate('5/3', 'd/m', ${JSON.stringify(TODAY)}));`,
      elsewhere,
    ).event.value;
    expect(during).toBe(before);
    expect(read()).toBe(before);
  });

  it("can't be replaced or removed by a script", () => {
    const vm = realm();
    const before = vm.__acrojsParseDate;
    const output = run(
      vm,
      [
        'var tried = [];',
        'try { __acrojsParseDate = function () { return "mine"; }; } catch (error) { tried.push("assign"); }',
        'try { delete globalThis.__acrojsParseDate; } catch (error) { tried.push("delete"); }',
        'try { Object.defineProperty(globalThis, "__acrojsParseDate", { value: 1 }); } catch (error) { tried.push("define"); }',
        'event.value = typeof __acrojsParseDate;',
      ].join('\n'),
      input({}, ''),
    );
    expect(output.event.value).toBe('function');
    expect(vm.__acrojsParseDate).toBe(before);
    expect(Object.getOwnPropertyDescriptor(vm, '__acrojsParseDate')).toMatchObject({
      writable: false,
      configurable: false,
      enumerable: false,
    });
    // The two entries beside it are held the same way.
    for (const name of ['__acrojsRun', '__acrojsBoot'] as const) {
      expect(Object.getOwnPropertyDescriptor(vm, name)).toMatchObject({
        writable: false,
        configurable: false,
      });
    }
  });
});
