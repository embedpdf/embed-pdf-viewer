import { describe, expect, it } from 'vitest';

import { dateLabel, fullDateTime } from '../../../chrome/src/ui/comments-panel';

describe('comments-panel date formatting', () => {
  it('returns an empty string when the input is null or invalid', () => {
    expect(dateLabel(null)).toBe('');
    expect(dateLabel('')).toBe('');
    expect(dateLabel('not-a-valid-date')).toBe('');

    expect(fullDateTime(null)).toBe('');
    expect(fullDateTime('')).toBe('');
    expect(fullDateTime('not-a-valid-date')).toBe('');
  });

  it('formats dates from the current calendar year with month, day, and time', () => {
    const currentYear = new Date().getFullYear();
    const iso = `${currentYear}-09-14T14:30:00Z`;
    const label = dateLabel(iso, 'en-US');

    expect(label).toContain('Sep 14');
    expect(label).toMatch(/\d{1,2}:\d{2}/);
  });

  it('formats dates from a previous calendar year with the year included', () => {
    const previousYear = new Date().getFullYear() - 1;
    const iso = `${previousYear}-05-20T09:15:00Z`;
    const label = dateLabel(iso, 'en-US');

    expect(label).toContain(String(previousYear));
    expect(label).toContain('May 20');
    expect(label).toMatch(/\d{1,2}:\d{2}/);
  });

  it('respects the provided locale', () => {
    const currentYear = new Date().getFullYear();
    const iso = `${currentYear}-11-10T14:30:00Z`;
    const deLabel = dateLabel(iso, 'de-DE');

    expect(deLabel).toContain('Nov');
  });

  it('uses custom formatDate callback when provided', () => {
    const iso = '2026-01-01T12:00:00Z';
    const custom = (date: Date) => `custom-${date.toISOString().slice(0, 10)}`;
    expect(dateLabel(iso, 'en-US', custom)).toBe('custom-2026-01-01');
  });

  it('formats fullDateTime with full date and time for hover title', () => {
    const iso = '2026-03-15T10:20:30Z';
    const title = fullDateTime(iso, 'en-US');

    expect(title).toContain('2026');
    expect(title).toContain('March 15');
    expect(title).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });
});
