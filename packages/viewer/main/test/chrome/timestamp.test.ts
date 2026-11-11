/**
 * A moment as the viewer writes it: the day and the time in its row, with the year only when it
 * isn't this one; the whole date and time where there's room; each the way its format language
 * writes it, and the same wherever the reader's clock is; and no moment for a date string that
 * names none.
 */
import { describe, expect, it } from 'vitest';

import { timestampFormat, timestampOf } from '../../../chrome/src/ui/timestamp';

/** 14 September 2026 at 14:30:05 on the reader's own clock, whatever its time zone. */
const MOMENT = new Date(2026, 8, 14, 14, 30, 5);
const LATER_THAT_YEAR = new Date(2026, 11, 31, 23, 59);
const THE_YEAR_AFTER = new Date(2027, 0, 1);

describe('timestampFormat', () => {
  it('writes the day and the time, without the year while it is this year', () => {
    expect(timestampFormat('en-US').short(MOMENT, LATER_THAT_YEAR)).toMatch(/^Sep 14, 2:30\sPM$/);
  });

  it('adds the year once it is another one', () => {
    const english = timestampFormat('en-US');
    expect(english.short(MOMENT, THE_YEAR_AFTER)).toMatch(/^Sep 14, 2026, 2:30\sPM$/);
    // A minute before midnight on New Year's Eve, read a minute later.
    expect(english.short(LATER_THAT_YEAR, THE_YEAR_AFTER)).toMatch(/^Dec 31, 2026, 11:59\sPM$/);
  });

  it('writes the way its format language does', () => {
    expect(timestampFormat('en-GB').short(MOMENT, LATER_THAT_YEAR)).toMatch(/^14 Sept?, 14:30$/);
    expect(timestampFormat('de').short(MOMENT, LATER_THAT_YEAR)).toMatch(/^14\. Sept?\., 14:30$/);
    expect(timestampFormat('de').short(MOMENT, THE_YEAR_AFTER)).toMatch(
      /^14\. Sept?\. 2026, 14:30$/,
    );
  });

  it('writes the whole date and the time to the second', () => {
    const whole = timestampFormat('en-US').full(MOMENT);
    expect(whole).toContain('Monday, September 14, 2026');
    expect(whole).toMatch(/2:30:05\sPM$/);
    expect(timestampFormat('en-GB').full(MOMENT)).toMatch(
      /^Monday,? 14 September 2026.* 14:30:05$/,
    );
  });

  it("writes in the browser's own language without a format language", () => {
    expect(timestampFormat(undefined).short(MOMENT, LATER_THAT_YEAR)).toMatch(/14/);
  });

  it("builds a language's formats once", () => {
    expect(timestampFormat('en-US')).toBe(timestampFormat('en-US'));
    expect(timestampFormat('en-US')).not.toBe(timestampFormat('en-GB'));
  });
});

describe('timestampOf', () => {
  it('reads the moment a date string names', () => {
    expect(timestampOf('2026-09-14T14:30:05Z')?.getTime()).toBe(Date.UTC(2026, 8, 14, 14, 30, 5));
  });

  it('reads no moment from nothing, or from text that names none', () => {
    expect(timestampOf(null)).toBeNull();
    expect(timestampOf(undefined)).toBeNull();
    expect(timestampOf('')).toBeNull();
    expect(timestampOf('not a date')).toBeNull();
  });
});
