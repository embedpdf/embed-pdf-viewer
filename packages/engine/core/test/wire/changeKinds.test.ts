import { afterEach, describe, expect, test } from 'vitest';
import {
  API_VERSION,
  CHANGE_KIND_SINCE,
  CHANGE_KINDS,
  changeKindSince,
  changeKindsUnknownTo,
  isChangeKind,
  parseApiVersion,
} from '../../src/wire';

/**
 * The kinds of change op and result item 3.0.0 shipped with. This list never
 * changes: a kind that isn't in it arrived later, and says in which version.
 */
const KINDS_OF_3_0 = [
  'annotations.create',
  'annotations.delete',
  'annotations.reorder',
  'annotations.restore',
  'annotations.update',
  'attachments.create',
  'attachments.delete',
  'attachments.restore',
  'forms.addWidget',
  'forms.create',
  'forms.delete',
  'forms.deleteWidget',
  'forms.removeWidget',
  'forms.reorderCalculations',
  'forms.reorderWidgets',
  'forms.reset',
  'forms.restore',
  'forms.restoreWidget',
  'forms.setAppearanceText',
  'forms.setDisplay',
  'forms.setSignatureAppearance',
  'forms.setValue',
  'forms.update',
  'forms.updateWidget',
  'metadata.update',
  'metadata.updateCustom',
  'outline.create',
  'outline.delete',
  'outline.move',
  'outline.restore',
  'outline.update',
  'pages.copy',
  'pages.delete',
  'pages.insert',
  'pages.insertBlank',
  'pages.reorder',
  'pages.restore',
  'pages.rotate',
];

const own = parseApiVersion(API_VERSION)!;
const NEWER = `${own.major}.${own.minor + 1}`;

describe('the version each change kind arrived in', () => {
  test('every kind that 3.0 did not have says its version, and no other kind does', () => {
    const later = CHANGE_KINDS.filter((kind) => !KINDS_OF_3_0.includes(kind));
    expect(Object.keys(CHANGE_KIND_SINCE).sort()).toEqual([...later].sort());
    for (const kind of later.filter(isChangeKind)) {
      const since = parseApiVersion(changeKindSince(kind));
      expect(since, kind).not.toBeNull();
      expect(since!.major > 3 || since!.minor > 0, kind).toBe(true);
    }
  });

  test('no kind of 3.0 is gone', () => {
    expect(KINDS_OF_3_0.filter((kind) => !isChangeKind(kind))).toEqual([]);
    expect(changeKindSince('pages.rotate')).toBe('3.0');
    expect(changeKindSince('pages.setScale')).toBe('3.1');
  });
});

describe('the kinds the other side does not have', () => {
  afterEach(() => {
    delete CHANGE_KIND_SINCE['pages.copy'];
  });

  test('an older side lacks the kinds that arrived after it, each named once', () => {
    const kinds = ['pages.rotate', 'pages.setScale', 'annotations.create', 'pages.setScale'];
    expect(changeKindsUnknownTo('3.0', kinds)).toEqual(['pages.setScale']);
    expect(changeKindsUnknownTo('3.1', kinds)).toEqual([]);
    expect(changeKindsUnknownTo('2.9', ['pages.rotate'])).toEqual(['pages.rotate']);
  });

  test('a side of this version, a newer one, and one that did not say have them all', () => {
    for (const version of [API_VERSION, NEWER, `${own.major + 1}.0`, null, 'not a version']) {
      expect(changeKindsUnknownTo(version, CHANGE_KINDS), String(version)).toEqual([]);
    }
  });

  test('two sides of one build talk while a kind names a version the packages lack', () => {
    CHANGE_KIND_SINCE['pages.copy'] = `${own.major}.${own.minor + 1}`;
    expect(changeKindsUnknownTo(API_VERSION, ['pages.copy'])).toEqual([]);
    expect(changeKindsUnknownTo('3.0', ['pages.copy'])).toEqual(['pages.copy']);
  });

  test('a kind this build does not have is one only a newer side has', () => {
    const kinds = ['pages.rotate', 'future.thing'];
    for (const version of ['3.0', API_VERSION, null]) {
      expect(changeKindsUnknownTo(version, kinds), String(version)).toEqual(['future.thing']);
    }
    expect(changeKindsUnknownTo(NEWER, kinds)).toEqual([]);
  });
});
