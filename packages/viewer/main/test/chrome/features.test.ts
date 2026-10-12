/**
 * What `disable` and `readOnly` turn off, as the commands plugin's settings. The chrome
 * (`@embedpdf/viewer-chrome`) has no test runner of its own: its logic is tested here, next to
 * the browser tests of the viewer it delivers.
 */
import { describe, expect, it } from 'vitest';

import { disabledSettingsOf } from '../../../chrome/src/features';

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
