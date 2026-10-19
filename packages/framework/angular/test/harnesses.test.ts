/**
 * The test harnesses (`@angular/cdk/testing`) on a real Stage: the pages it shows, the search
 * layers inside it, their highlights (and the active match's), and a click on a highlight
 * emitting `(hitClick)`.
 */
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfSearch, EpdfSearchLayer, SearchToken, withSearch } from '@embedpdf/angular/search';
import type { SearchHit } from '@embedpdf/angular/search';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfSearchLayerHarness, EpdfStageHarness } from '@embedpdf/angular/testing';
import { bytesInput, kernelOf, mount, viewerHost } from './fixtures';
import { searchEngine } from './search-fixtures';

// happy-dom lays nothing out: every element measures 800 × 600, enough for the Stage.
const measured = ['clientWidth', 'clientHeight'] as const;
const originals = measured.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
);
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 800,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 600,
  });
});
afterAll(() => {
  measured.forEach((name, index) => {
    const original = originals[index];
    if (original) Object.defineProperty(HTMLElement.prototype, name, original);
  });
});
afterEach(() => TestBed.resetTestingModule());

/** A Stage of two small pages whose matches are clickable, keeping what was clicked. */
@Component({
  selector: 'test-search-stage',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfSearchLayer],
  template: `
    <epdf-stage style="height: 600px">
      <ng-template epdfPage>
        <epdf-render-layer />
        <epdf-search-layer (hitClick)="clicked.push($event)" />
      </ng-template>
    </epdf-stage>
  `,
})
class SearchStage {
  readonly clicked: SearchHit[] = [];
}

describe('EpdfStageHarness and EpdfSearchLayerHarness', () => {
  it('count the pages and highlights, and click a match', async () => {
    const fixture = await mount(
      viewerHost({
        imports: [SearchStage],
        config: { engine: searchEngine() },
        features: [withStage({ zoom: { pageWidth: 100 } }), withRender(), withSearch()],
        template: '<test-search-stage />',
      }),
    );
    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('doc'));
    await kernel.capability(SearchToken).search({ text: 'x' });
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const stage = await loader.getHarness(EpdfStageHarness);
    await vi.waitFor(async () => expect(await stage.getShownPageCount()).toBe(2));

    // Page 5 has two matches, the first of them active; page 7 has one.
    const [five, seven] = await stage.getAllHarnesses(EpdfSearchLayerHarness);
    expect(await five!.getHighlightCount()).toBe(2);
    expect(await five!.getActiveHighlightCount()).toBe(1);
    expect(await seven!.getHighlightCount()).toBe(1);
    expect(await seven!.getActiveHighlightCount()).toBe(0);
    expect(await five!.isClickable()).toBe(true);

    await five!.clickHighlight(1);
    const host = fixture.debugElement.children[0]!.componentInstance as SearchStage;
    const search = fixture.debugElement.injector.get(EpdfSearch);
    expect(host.clicked).toEqual([search.hits()[1]]);
    await expect(five!.clickHighlight(5)).rejects.toThrow(/no highlight 5/);
  });
});
