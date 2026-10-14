/**
 * `epdfSurfaceFocus`: the cursor moves into its element when the panel asks, and when the
 * element appears because it did; a plain open never moves it, `epdfSurfaceFocusSelect` selects
 * the text, and one document's request stays out of another's.
 */
import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { EpdfDocumentScope } from '@embedpdf/angular/runtime';
import { EpdfShell, EpdfSurfaceFocus, ShellToken, withShell } from '@embedpdf/angular/shell';
import { bytesInput, kernelOf, mount, viewerHost } from './fixtures';

afterEach(() => TestBed.resetTestingModule());

/** Fields with text in them: one always there, one that selects, one only while its panel is open. */
@Component({
  selector: 'test-fields',
  imports: [EpdfSurfaceFocus],
  template: `
    <input data-field="search" value="contract" epdfSurfaceFocus="search" />
    <input data-field="notes" value="contract" epdfSurfaceFocus="notes" epdfSurfaceFocusSelect />
    @if (panel.isOpen()) {
      <input data-field="panel" value="contract" epdfSurfaceFocus="panel" />
    }
  `,
})
class Fields {
  protected readonly panel = inject(EpdfShell).surface('panel');
}

async function opened(template = '<test-fields />') {
  const fixture = await mount(
    viewerHost({
      imports: [Fields, EpdfSurfaceFocus, EpdfDocumentScope],
      features: [withShell()],
      template,
    }),
  );
  await kernelOf(fixture).documents.open(bytesInput('a'));
  await fixture.whenStable();
  const field = (name: string) =>
    fixture.nativeElement.querySelector(`[data-field="${name}"]`) as HTMLInputElement;
  const shellOf = (id = 'a') => kernelOf(fixture).capability(ShellToken, id);
  return { fixture, field, shellOf };
}

describe('epdfSurfaceFocus', () => {
  it('focuses its element on every request, also with the panel open already', async () => {
    const { fixture, field, shellOf } = await opened();
    shellOf().open('search', { focus: true });
    await fixture.whenStable();
    expect(document.activeElement).toBe(field('search'));

    field('search').blur();
    shellOf().open('search', { focus: true });
    await fixture.whenStable();
    expect(document.activeElement).toBe(field('search'));
  });

  it('never focuses on a plain open', async () => {
    const { fixture, field, shellOf } = await opened();
    shellOf().open('panel');
    await fixture.whenStable();
    expect(field('panel')).toBeTruthy();
    expect(document.activeElement).not.toBe(field('panel'));
  });

  it('focuses an element that appears because its panel opened asking for it', async () => {
    const { fixture, field, shellOf } = await opened();
    shellOf().toggle('panel', { focus: true });
    await fixture.whenStable();
    expect(document.activeElement).toBe(field('panel'));
  });

  it('selects the text with epdfSurfaceFocusSelect, and only places the cursor without it', async () => {
    const { fixture, field, shellOf } = await opened();
    field('search').setSelectionRange(8, 8);
    shellOf().open('search', { focus: true });
    await fixture.whenStable();
    expect([field('search').selectionStart, field('search').selectionEnd]).toEqual([8, 8]);

    shellOf().open('notes', { focus: true });
    await fixture.whenStable();
    expect(document.activeElement).toBe(field('notes'));
    expect([field('notes').selectionStart, field('notes').selectionEnd]).toEqual([0, 8]);
  });

  it("reads its template's document: a request in one never moves the cursor in another", async () => {
    const { fixture, field, shellOf } = await opened(`
      <div [epdfDocumentScope]="'a'"><input data-field="a-notes" epdfSurfaceFocus="notes" /></div>
      <div [epdfDocumentScope]="'b'"><input data-field="b-search" epdfSurfaceFocus="search" /></div>
    `);
    await kernelOf(fixture).documents.open(bytesInput('b'));
    await fixture.whenStable();
    shellOf('a').open('search', { focus: true });
    await fixture.whenStable();
    expect(document.activeElement).not.toBe(field('b-search'));
    shellOf('b').open('search', { focus: true });
    await fixture.whenStable();
    expect(document.activeElement).toBe(field('b-search'));
    shellOf('b').open('notes', { focus: true });
    await fixture.whenStable();
    expect(document.activeElement).toBe(field('b-search'));
  });
});
