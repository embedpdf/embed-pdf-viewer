import { describe, expect, test } from 'vitest';

import { annotationReadDriftOf } from '../../src/conformance/annotationReadDrift';

describe('annotationReadDriftOf', () => {
  test('reports missing, undeclared and invalid fields per kind', () => {
    const drift = annotationReadDriftOf([
      { subtype: 'stamp', name: 7, extra: true },
      { subtype: 'caret', extra: true },
    ]);
    expect(drift).toContain('name: invalid (stamp)');
    expect(drift).toContain('rect: missing (every kind)');
    expect(drift).toContain('extra: undeclared (every kind)');
    expect(drift).toContain('intent: missing (caret)');
  });

  test('reports a popup read as an unsupported placeholder', () => {
    const drift = annotationReadDriftOf([{ subtype: 'unsupported', rawSubtypeName: 'Popup' }]);
    expect(drift).toContain('subtype: popup reads as unsupported (every kind)');
  });

  test('reports a subtype without a declaration', () => {
    expect(annotationReadDriftOf([{ subtype: 'sound' }])).toEqual([
      'subtype: no declaration (every kind)',
    ]);
  });

  test('returns sorted lines, so the order of reads does not matter', () => {
    const reads = [{ subtype: 'stamp' }, { subtype: 'caret' }];
    expect(annotationReadDriftOf(reads)).toEqual(annotationReadDriftOf([...reads].reverse()));
  });
});
