/**
 * What `features`, `disable` and `readOnly` turn off, as the commands plugin's settings. The
 * chrome (`@embedpdf/viewer-chrome`) has no test runner of its own: its logic is tested here, next
 * to the browser tests of the viewer it delivers.
 */
import { describe, expect, it } from 'vitest';

import {
  byHandSettingsOf,
  disabledSettingsOf,
  leavesNothingToChange,
  unknownFeaturesOf,
} from '../../../chrome/src/features';

/** Every feature on, the ones that start off too. */
const EVERYTHING = {
  measurement: true,
  redaction: true,
  'forms.building': true,
  snapshots: true,
} as const;

const categoriesOf = (...args: Parameters<typeof disabledSettingsOf>) =>
  disabledSettingsOf(...args).disabledCategories;

describe('disabledSettingsOf', () => {
  it('starts with building forms, redaction, measuring and snapshots off', () => {
    expect(disabledSettingsOf({})).toEqual({
      disabledCategories: ['forms.building', 'redaction', 'measurement', 'snapshots'],
      disabledCommands: [],
    });
    expect(disabledSettingsOf({ features: {}, disable: [], readOnly: false })).toEqual(
      disabledSettingsOf({}),
    );
  });

  it('turns nothing off once features turns on the ones that start off', () => {
    expect(categoriesOf({ features: EVERYTHING })).toEqual([]);
  });

  it('turns a feature on or off by its name, and leaves out names without a value', () => {
    expect(categoriesOf({ features: { measurement: true, forms: false } })).toEqual([
      'forms',
      'redaction',
      'snapshots',
    ]);
    expect(categoriesOf({ features: { measurement: undefined } })).toEqual(categoriesOf({}));
  });

  it('turns building forms on with its part, or with its feature', () => {
    expect(categoriesOf({ features: { 'forms.building': true } })).not.toContain('forms.building');
    expect(categoriesOf({ features: { forms: true } })).not.toContain('forms.building');
  });

  it('lets a part win over its feature, in either order', () => {
    const highlightOnly = [
      'annotations.markup',
      'annotations.drawing',
      'annotations.text',
      'annotations.notes',
      'annotations.links',
    ];
    for (const features of [
      { annotations: false, 'annotations.highlight': true },
      { 'annotations.highlight': true, annotations: false },
    ]) {
      const off = categoriesOf({ features });
      expect(off).toEqual(expect.arrayContaining(highlightOnly));
      // The feature stays, for what isn't a part: the Annotate tab, for highlighting.
      expect(off).not.toContain('annotations');
      expect(off).not.toContain('annotations.highlight');
    }
  });

  it('turns a feature off whole while none of its parts is on', () => {
    const off = categoriesOf({ features: { annotations: false } });
    expect(off).toContain('annotations');
    expect(off.some((name) => name.startsWith('annotations.'))).toBe(false);
  });

  it('turns off a part and leaves its feature', () => {
    expect(
      categoriesOf({ features: { 'documents.download': false, 'documents.print': false } }),
    ).toEqual(expect.arrayContaining(['documents.download', 'documents.print']));
    expect(categoriesOf({ features: { 'documents.download': false } })).not.toContain('documents');
  });

  it("reads disable's features as false under features, and its commands as commands", () => {
    expect(
      disabledSettingsOf({ disable: ['forms.building', 'annotations.drawing', 'document:open'] }),
    ).toEqual({
      disabledCategories: [
        'annotations.drawing',
        'forms.building',
        'redaction',
        'measurement',
        'snapshots',
      ],
      disabledCommands: ['document:open'],
    });
  });

  it('lets features win over disable where both name a feature', () => {
    expect(
      categoriesOf({ disable: ['documents.download'], features: { documents: true } }),
    ).not.toContain('documents.download');
    const off = categoriesOf({
      disable: ['annotations'],
      features: { 'annotations.highlight': true },
    });
    expect(off).not.toContain('annotations.highlight');
    expect(off).toContain('annotations.markup');
  });

  it('turns off every feature that changes the document with readOnly, whatever features says', () => {
    expect(categoriesOf({ readOnly: true })).toEqual([
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
      'snapshots',
      'outline.editing',
    ]);
    expect(
      categoriesOf({ features: { ...EVERYTHING, annotations: true }, readOnly: true }),
    ).toEqual(expect.arrayContaining(['annotations', 'forms', 'redaction', 'measurement']));
  });

  it('keeps reading, searching, copying, downloading and printing on with readOnly', () => {
    const off = categoriesOf({ readOnly: true });
    for (const kept of ['text', 'search', 'thumbnails', 'outline', 'documents', 'comments']) {
      expect(off).not.toContain(kept);
    }
  });

  it('splits a feature into its parts for an exception inside it', () => {
    const off = categoriesOf({ readOnly: { except: ['forms.filling'] } });
    expect(off).toContain('forms.building');
    expect(off).not.toContain('forms');
    expect(off).not.toContain('forms.filling');
  });

  it('keeps a whole feature on for an exception that names it', () => {
    const off = categoriesOf({ readOnly: { except: ['annotations', 'signatures'] } });
    expect(off.some((feature) => feature.startsWith('annotations'))).toBe(false);
    expect(off).not.toContain('signatures.signing');
    expect(off).toContain('forms');
  });

  it('keeps every other part of a feature off when one part is kept', () => {
    const off = categoriesOf({ readOnly: { except: ['annotations.highlight'] } });
    expect(off).toEqual(
      expect.arrayContaining([
        'annotations.markup',
        'annotations.drawing',
        'annotations.text',
        'annotations.notes',
        'annotations.links',
      ]),
    );
    expect(off).not.toContain('annotations');
    expect(off).not.toContain('annotations.highlight');
  });

  it('adds what features turns off to readOnly, once each', () => {
    const off = categoriesOf({
      features: { 'documents.download': false, 'documents.print': false, forms: false },
      readOnly: { except: ['forms.filling'] },
    });
    expect(off).toEqual(expect.arrayContaining(['documents.download', 'documents.print', 'forms']));
    const shapes = categoriesOf({ features: { shapes: false }, readOnly: true });
    expect(shapes.filter((feature) => feature === 'shapes')).toHaveLength(1);
  });

  it("reaches your commands' features, and their parts a feature covers", () => {
    const yours = ['acme.review', 'acme.approve'];
    expect(categoriesOf({ features: { 'acme.review': false } }, yours)).toContain('acme.review');
    const off = categoriesOf({ features: { acme: false, 'acme.review': true } }, yours);
    expect(off).toContain('acme.approve');
    expect(off).not.toContain('acme');
    expect(off).not.toContain('acme.review');
  });
});

describe('byHandSettingsOf', () => {
  it('lets people change everything by hand while everything is on', () => {
    expect(byHandSettingsOf({ features: EVERYTHING })).toEqual({ editable: true, fillable: true });
    // A single command turned off leaves what its feature made.
    expect(byHandSettingsOf({ features: EVERYTHING, disable: ['tool:square'] })).toEqual({
      editable: true,
      fillable: true,
    });
  });

  it('freezes what the features that start off made, until they are on', () => {
    const { editable, fillable } = byHandSettingsOf({});
    expect(fillable).toBe(true);
    expect(editable).toEqual(expect.arrayContaining(['highlight', 'square', 'stamp']));
    for (const kind of ['redact', 'line-dimension', 'widget']) expect(editable).not.toContain(kind);
  });

  it('freezes everything with readOnly', () => {
    expect(byHandSettingsOf({ readOnly: true })).toEqual({ editable: false, fillable: false });
  });

  it('freezes shapes and keeps highlights with shapes off', () => {
    const { editable, fillable } = byHandSettingsOf({ features: { ...EVERYTHING, shapes: false } });
    expect(fillable).toBe(true);
    expect(editable).toEqual(expect.arrayContaining(['highlight', 'free-text', 'line-dimension']));
    for (const shape of ['square', 'circle', 'line', 'polygon', 'polyline'])
      expect(editable).not.toContain(shape);
  });

  it('tells measurements apart from the shapes they are drawn as', () => {
    const { editable } = byHandSettingsOf({ features: { ...EVERYTHING, measurement: false } });
    expect(editable).toContain('line');
    expect(editable).not.toContain('line-dimension');
  });

  it('keeps what readOnly excepts: a form people fill in, its signature fields not', () => {
    expect(byHandSettingsOf({ readOnly: { except: ['forms.filling'] } })).toEqual({
      editable: false,
      fillable: ['text', 'checkbox', 'radio', 'combobox', 'listbox', 'pushbutton'],
    });
    expect(byHandSettingsOf({ readOnly: { except: ['annotations.highlight'] } }).editable).toEqual([
      'highlight',
    ]);
  });
});

describe('unknownFeaturesOf', () => {
  it('finds the names that are no feature or part', () => {
    expect(
      unknownFeaturesOf(
        { snapshot: true, 'annotations.hilight': false, 'documents.download': false },
        [],
      ),
    ).toEqual(['snapshot', 'annotations.hilight']);
  });

  it("knows your commands' features and their parts", () => {
    expect(unknownFeaturesOf({ acme: false, 'acme.review': true }, ['acme.review'])).toEqual([]);
    expect(unknownFeaturesOf(undefined, [])).toEqual([]);
  });
});

describe('leavesNothingToChange', () => {
  it('holds while every feature that changes the document is off', () => {
    const off = (names: readonly string[]) => (feature: string) =>
      names.some((name) => feature === name || feature.startsWith(`${name}.`));
    expect(leavesNothingToChange(off(categoriesOf({ readOnly: true })))).toBe(true);
    const filling = categoriesOf({ readOnly: { except: ['forms.filling'] } });
    expect(leavesNothingToChange(off(filling))).toBe(false);
    expect(leavesNothingToChange(off(categoriesOf({})))).toBe(false);
  });
});
