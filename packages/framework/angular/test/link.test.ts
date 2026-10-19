/**
 * The link layer against a real kernel: the `epdfLink` template gets the link and the layer's
 * own anchor, every click follows the link through the plugin (which opens a website through
 * the opener this package registers), a press on a link never reaches the page below it, and
 * the service opens websites from code while it's there.
 */
import { NgTemplateOutlet } from '@angular/common';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toPageRef } from '@embedpdf/core';
import type { DocumentHandle, Engine } from '@embedpdf/core';
import { pageTransform } from '@embedpdf/core-geometry';
import { createPageContext, EPDF_PAGE } from '@embedpdf/angular/runtime';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  EpdfLink,
  EpdfLinkLayer,
  EpdfLinkTemplate,
  LinkToken,
  withLink,
  type LinkActivation,
} from '@embedpdf/angular/link';
import { bytesInput, kernelOf, mount, pageLayout, viewerHost } from './fixtures';

const linkDto = (objectNumber: number, target: unknown) => ({
  ref: { kind: 'objectNumber', page: toPageRef(1), objectNumber },
  page: toPageRef(1),
  index: objectNumber,
  subtype: 'link',
  rect: { x: 100, y: 100 + objectNumber * 50, width: 200, height: 30 },
  target,
});

/** One page with two links: a website, and a script the opener must refuse. */
const engine = {
  open: () =>
    Promise.resolve({
      id: 'doc',
      events: { subscribe: () => () => {}, lastServerId: () => null },
      pages: { list: () => Promise.resolve({ pageCount: 1, pages: [pageLayout(1, 0)] }) },
      security: { allows: () => true },
      page: () => ({
        annotations: {
          list: () =>
            Promise.resolve({
              annotations: [
                linkDto(1, { kind: 'uri', uri: 'https://example.com/' }),
                linkDto(2, { kind: 'uri', uri: 'javascript:alert(1)' }),
              ],
            }),
        },
      }),
      close: () => Promise.resolve(),
    } as unknown as DocumentHandle),
  destroy: () => Promise.resolve(),
} as unknown as Engine;

const pageContext = () =>
  createPageContext({
    documentId: () => 'doc',
    ref: () => toPageRef(1),
    view: () => 'test-view',
    pageIndex: signal(0),
    frame: signal({ top: 0, right: 0, bottom: 0, left: 0 }),
    transform: signal(
      pageTransform({
        pageSize: { width: 600, height: 800 },
        rotation: 0,
        scale: 1,
        baseScale: 1,
        dpr: 1,
      }),
    ),
    getRect: () => new DOMRect(0, 0, 600, 800),
  });

/** The page, under an element that listens natively for presses, as the Stage does. */
@Component({
  selector: 'test-link-page',
  imports: [EpdfLinkLayer],
  providers: [{ provide: EPDF_PAGE, useFactory: pageContext }],
  template: `<div class="stage" (pointerdown)="presses = presses + 1"><epdf-link-layer /></div>`,
})
class LinkPage {
  presses = 0;
}

/** The page, with every link drawn by the app around the layer's own anchor. */
@Component({
  selector: 'test-custom-links',
  imports: [EpdfLinkLayer, EpdfLinkTemplate, NgTemplateOutlet],
  providers: [{ provide: EPDF_PAGE, useFactory: pageContext }],
  template: `
    <epdf-link-layer>
      <ng-template epdfLink let-link let-native="native">
        <span class="custom" [attr.data-id]="link.id" [attr.data-kind]="link.target.kind">
          <ng-container [ngTemplateOutlet]="native" />
        </span>
      </ng-template>
    </epdf-link-layer>
  `,
})
class CustomLinks {}

async function mountViewer(template: string, imports: unknown[]) {
  const fixture = await mount(
    viewerHost({
      template,
      imports: imports as never,
      config: { engine },
      features: [withInteraction(), withLink()],
    }),
  );
  await kernelOf(fixture).documents.open(bytesInput('doc'));
  return fixture;
}

/** Wait until the page's links are read and drawn. */
async function anchors(fixture: Awaited<ReturnType<typeof mountViewer>>) {
  await vi.waitFor(async () => {
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('a')).toHaveLength(2);
  });
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll('a')];
}

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

describe('<epdf-link-layer>', () => {
  it('hands the epdfLink template the link and the layer’s own anchor', async () => {
    const fixture = await mountViewer('<test-custom-links />', [CustomLinks]);
    await anchors(fixture);
    const custom = (fixture.nativeElement as HTMLElement).querySelector('.custom[data-id="obj:1"]');
    expect(custom?.getAttribute('data-kind')).toBe('uri');
    // The layer's anchor, inside the app's drawing, with the website as its href.
    expect(custom?.querySelector('a')?.getAttribute('href')).toBe('https://example.com/');
  });

  it('follows a click through the plugin, which opens an allowed website and reports the rest', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const fixture = await mountViewer('<test-link-page />', [LinkPage]);
    const outcomes: LinkActivation['outcome'][] = [];
    kernelOf(fixture)
      .capability(LinkToken)
      .onActivated((event) => outcomes.push(event.activation.outcome));
    const [website, script] = await anchors(fixture);

    website!.click();
    expect(open).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
    script!.click();
    expect(open).toHaveBeenCalledTimes(1);
    expect(outcomes).toEqual(['uri', 'reported']);
  });

  it('keeps a press on a link from the page below it', async () => {
    const fixture = await mountViewer('<test-link-page />', [LinkPage]);
    const [website] = await anchors(fixture);
    website!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    const page = fixture.debugElement.children[0]!.componentInstance as LinkPage;
    expect(page.presses).toBe(0);
  });
});

describe('EpdfLink', () => {
  it('opens a website from code while the service is there', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const fixture = await mountViewer('', []);
    const link = fixture.debugElement.injector.get(EpdfLink);
    await fixture.whenStable(); // the opener is registered once the document is there
    expect(link.activate({ kind: 'uri', uri: 'https://example.com/a' }).outcome).toBe('uri');
    expect(open).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener,noreferrer');
  });

  it('streams activated$', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const fixture = await mountViewer('', []);
    const link = fixture.debugElement.injector.get(EpdfLink);
    const kinds: string[] = [];
    link.activated$.subscribe(({ target }) => kinds.push(target.kind));
    link.activate({ kind: 'uri', uri: 'https://example.com/b' });
    expect(kinds).toEqual(['uri']);
  });
});
