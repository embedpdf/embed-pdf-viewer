/**
 * The outline's service: its State table as signals, empty with no document and read once one
 * is open (reading it reads the outline), and its calls acting on that document.
 */
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentHandle, Engine } from '@embedpdf/core';
import { EpdfOutline, withOutline, type OutlineItem } from '@embedpdf/angular/outline';
import { bytesInput, handleFor, kernelOf, mount, viewerHost } from './fixtures';

const item = (objectNumber: number, title: string, parent: number | null, open = false) =>
  ({
    ref: { kind: 'objectNumber', objectNumber },
    parent: parent === null ? null : { kind: 'objectNumber', objectNumber: parent },
    title,
    target: null,
    action: null,
    open,
    color: null,
    bold: false,
    italic: false,
  }) satisfies OutlineItem;

/** Chapter (open) with Section; Appendix. */
const ITEMS = [item(5, 'Chapter', null, true), item(6, 'Section', 5), item(7, 'Appendix', null)];

const engine = {
  open: (input: { id?: string }) =>
    Promise.resolve({
      ...handleFor(input.id ?? 'doc'),
      outline: { get: () => Promise.resolve({ items: ITEMS, incomplete: false }) },
    } as unknown as DocumentHandle),
  destroy: () => Promise.resolve(),
} as unknown as Engine;

afterEach(() => TestBed.resetTestingModule());

describe('EpdfOutline', () => {
  it('reads empty with no document, and the outline once one is open', async () => {
    const fixture = await mount(
      viewerHost({ template: '', config: { engine }, features: [withOutline()] }),
    );
    const outline = fixture.debugElement.injector.get(EpdfOutline);
    expect(outline.rows()).toEqual([]);
    expect(outline.status()).toBe('idle');
    expect(outline.canEdit()).toBe(false);

    await kernelOf(fixture).documents.open(bytesInput('doc'));
    // Reading the service reads the outline: nothing reads it as the document opens.
    await vi.waitFor(() => expect(outline.status()).toBe('ready'));
    expect(outline.rows().map((row) => [row.item.title, row.depth])).toEqual([
      ['Chapter', 0],
      ['Section', 1],
      ['Appendix', 0],
    ]);
    expect(outline.canEdit()).toBe(true);

    outline.collapseAll();
    expect(outline.rows().map((row) => row.item.title)).toEqual(['Chapter', 'Appendix']);
    expect(outline.getChildren(ITEMS[0]!.ref).map((each) => each.title)).toEqual(['Section']);
  });
});
