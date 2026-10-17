/**
 * Test harnesses for the viewer's components, built on `@angular/cdk/testing`: a test talks to
 * the Stage and the search highlights the way a user does, through the page, instead of
 * reaching into their internals.
 *
 *   const loader = TestbedHarnessEnvironment.loader(fixture);
 *   const stage = await loader.getHarness(EpdfStageHarness);
 *   expect(await stage.getShownPageCount()).toBe(2);
 *   const [layer] = await stage.getAllHarnesses(EpdfSearchLayerHarness);
 *   await layer.clickHighlight(0); // (hitClick) emits the first match
 *
 * They read only what the components draw, so they keep working when the inside changes.
 */
import {
  ComponentHarness,
  ContentContainerComponentHarness,
  HarnessPredicate,
  type BaseHarnessFilters,
} from '@angular/cdk/testing';

/**
 * `<epdf-stage>`. It holds harnesses for what's drawn in it: `stage.getAllHarnesses(
 * EpdfSearchLayerHarness)` gives the search layers of the pages on screen.
 */
export class EpdfStageHarness extends ContentContainerComponentHarness {
  static hostSelector = 'epdf-stage';

  /** A Stage that matches `options`: `EpdfStageHarness.with({ selector: '.thumbnails' })`. */
  static with(options: BaseHarnessFilters = {}): HarnessPredicate<EpdfStageHarness> {
    return new HarnessPredicate(EpdfStageHarness, options);
  }

  private readonly pages = this.locatorForAll('epdf-page-surface');

  /** How many pages are drawn now: the Stage draws only the ones on screen. */
  async getShownPageCount(): Promise<number> {
    return (await this.pages()).length;
  }

  /** The cursor over the Stage: the one the active tool asks for, such as `text` over text. */
  async getCursor(): Promise<string> {
    return (await this.host()).getCssValue('cursor');
  }

  /** Turn the mouse wheel over the Stage: it scrolls, as a user's wheel does. */
  async scrollBy(deltaY: number, deltaX = 0): Promise<void> {
    await (await this.host()).dispatchEvent('wheel', { deltaX, deltaY });
  }
}

/**
 * `<epdf-search-layer>`: the search's highlights on one page. A match over two lines is two
 * highlights.
 */
export class EpdfSearchLayerHarness extends ComponentHarness {
  static hostSelector = 'epdf-search-layer';

  /** A search layer that matches `options`. */
  static with(options: BaseHarnessFilters = {}): HarnessPredicate<EpdfSearchLayerHarness> {
    return new HarnessPredicate(EpdfSearchLayerHarness, options);
  }

  private readonly highlights = this.locatorForAll('[data-epdf-search-hit]');
  private readonly activeHighlights = this.locatorForAll('[data-epdf-search-hit][data-active]');

  /** How many highlights the page shows: one per line of each match on it. */
  async getHighlightCount(): Promise<number> {
    return (await this.highlights()).length;
  }

  /** How many of them belong to the active match: none when it's on another page. */
  async getActiveHighlightCount(): Promise<number> {
    return (await this.activeHighlights()).length;
  }

  /** Whether the highlights take clicks: only while something listens to `(hitClick)`. */
  async isClickable(): Promise<boolean> {
    const [first] = await this.highlights();
    return first ? (await first.getCssValue('pointer-events')) === 'auto' : false;
  }

  /** Click the highlight at `index`, in the order the page draws them. */
  async clickHighlight(index: number): Promise<void> {
    const highlights = await this.highlights();
    const highlight = highlights[index];
    if (!highlight) {
      throw new Error(
        `EpdfSearchLayerHarness: no highlight ${index}; the page shows ${highlights.length}.`,
      );
    }
    await highlight.click();
  }
}
