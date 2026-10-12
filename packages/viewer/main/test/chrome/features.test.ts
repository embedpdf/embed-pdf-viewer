/**
 * What `disable` and `readOnly` turn off, as the commands plugin's settings. The chrome
 * (`@embedpdf/viewer-chrome`) has no test runner of its own: its logic is tested here, next to
 * the browser tests of the viewer it delivers.
 */
import { describe, expect, it } from 'vitest';

import {
  byHandSettingsOf,
  disabledSettingsOf,
  leavesNothingToChange,
} from '../../../chrome/src/features';

describe('disabledSettingsOf', () => {
  it('turns nothing off without disable or readOnly', () => {
    expect(disabledSettingsOf(undefined, undefined)).toEqual({
      disabledCategories: [],
      disabledCommands: [],
    });
    expect(disabledSettingsOf([], false)).toEqual({
      disabledCategories: [],
      disabledCommands: [],
    });
  });

  it('tells features from commands by the colon every command id has', () => {
    expect(
      disabledSettingsOf(['forms.building', 'annotations.drawing', 'document:open'], undefined),
    ).toEqual({
      disabledCategories: ['forms.building', 'annotations.drawing'],
      disabledCommands: ['document:open'],
    });
  });

  it('turns off every feature that changes the document with readOnly', () => {
    expect(disabledSettingsOf(undefined, true).disabledCategories).toEqual([
      'annotations',
      'shapes',
      'stamps',
      'comments.writing',
      'forms',
      'signatures.signing',
      'redaction',
      'measurement',
      'pages',
      'attachments.adding',
    ]);
  });

  it('keeps reading, searching, copying, downloading and printing on with readOnly', () => {
    const { disabledCategories } = disabledSettingsOf(undefined, true);
    for (const kept of ['text', 'search', 'thumbnails', 'outline', 'documents', 'comments']) {
      expect(disabledCategories).not.toContain(kept);
    }
  });

  it('splits a feature into its parts for an exception inside it', () => {
    const { disabledCategories } = disabledSettingsOf(undefined, { except: ['forms.filling'] });
    expect(disabledCategories).toContain('forms.building');
    expect(disabledCategories).not.toContain('forms');
    expect(disabledCategories).not.toContain('forms.filling');
  });

  it('keeps a whole feature on for an exception that names it', () => {
    const { disabledCategories } = disabledSettingsOf(undefined, {
      except: ['annotations', 'signatures'],
    });
    expect(disabledCategories.some((feature) => feature.startsWith('annotations'))).toBe(false);
    expect(disabledCategories).not.toContain('signatures.signing');
    expect(disabledCategories).toContain('forms');
  });

  it('keeps every other part of a feature off when one part is kept', () => {
    const { disabledCategories } = disabledSettingsOf(undefined, {
      except: ['annotations.highlight'],
    });
    expect(disabledCategories).toEqual(
      expect.arrayContaining([
        'annotations.markup',
        'annotations.drawing',
        'annotations.text',
        'annotations.notes',
        'annotations.links',
      ]),
    );
    expect(disabledCategories).not.toContain('annotations');
    expect(disabledCategories).not.toContain('annotations.highlight');
  });

  it('adds disable on top of readOnly, once each', () => {
    expect(
      disabledSettingsOf(['documents.download', 'documents.print', 'forms'], {
        except: ['forms.filling'],
      }),
    ).toEqual({
      disabledCategories: expect.arrayContaining([
        'documents.download',
        'documents.print',
        'forms',
        'forms.building',
      ]),
      disabledCommands: [],
    });
    const { disabledCategories } = disabledSettingsOf(['shapes'], true);
    expect(disabledCategories.filter((feature) => feature === 'shapes')).toHaveLength(1);
  });
});

describe('byHandSettingsOf', () => {
  it('lets people change everything by hand while nothing is off', () => {
    expect(byHandSettingsOf(undefined, undefined)).toEqual({ editable: true, fillable: true });
    // A single command turned off leaves what its feature made.
    expect(byHandSettingsOf(['tool:square', 'search'], false)).toEqual({
      editable: true,
      fillable: true,
    });
  });

  it('freezes everything with readOnly', () => {
    expect(byHandSettingsOf(undefined, true)).toEqual({ editable: false, fillable: false });
  });

  it('freezes shapes and keeps highlights with disable: shapes', () => {
    const { editable, fillable } = byHandSettingsOf(['shapes'], undefined);
    expect(fillable).toBe(true);
    expect(editable).toEqual(expect.arrayContaining(['highlight', 'free-text', 'line-dimension']));
    for (const shape of ['square', 'circle', 'line', 'polygon', 'polyline'])
      expect(editable).not.toContain(shape);
  });

  it('tells measurements apart from the shapes they are drawn as', () => {
    const { editable } = byHandSettingsOf(['measurement'], undefined);
    expect(editable).toContain('line');
    expect(editable).not.toContain('line-dimension');
  });

  it('keeps what readOnly excepts: a form people fill in, its signature fields not', () => {
    expect(byHandSettingsOf(undefined, { except: ['forms.filling'] })).toEqual({
      editable: false,
      fillable: ['text', 'checkbox', 'radio', 'combobox', 'listbox', 'pushbutton'],
    });
    expect(byHandSettingsOf(undefined, { except: ['annotations.highlight'] }).editable).toEqual([
      'highlight',
    ]);
  });
});

describe('leavesNothingToChange', () => {
  it('holds while every feature that changes the document is off', () => {
    const off = (names: readonly string[]) => (feature: string) =>
      names.some((name) => feature === name || feature.startsWith(`${name}.`));
    expect(leavesNothingToChange(off(disabledSettingsOf(undefined, true).disabledCategories))).toBe(
      true,
    );
    const filling = disabledSettingsOf(undefined, { except: ['forms.filling'] }).disabledCategories;
    expect(leavesNothingToChange(off(filling))).toBe(false);
    expect(leavesNothingToChange(off(['shapes']))).toBe(false);
  });
});
