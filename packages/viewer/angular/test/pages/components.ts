/**
 * Your own components in `<epdf-pdf-viewer>`: `epdfToolbarItem`, `epdfPanel` and `epdfRegion`
 * put them in the viewer, `EpdfToolbarItemContext` says where an item sits (and follows the bar
 * to a rail when the viewer narrows), and `<epdf-button>`, `<epdf-menu>` and `<epdf-menu-item>`
 * are the viewer's own. `components.test.ts` drives it.
 */
import { boot } from './boot';

import { Component, inject, signal } from '@angular/core';
import {
  EpdfButton,
  EpdfMenu,
  EpdfMenuItem,
  EpdfPanel,
  EpdfPdfViewer,
  EpdfRegion,
  EpdfToolbarItem,
  EpdfToolbarItemContext,
} from '@embedpdf/viewer-angular';
import type { LayoutFunction, Viewer } from '@embedpdf/viewer-angular';

import { checkRecord } from './check';

export interface ComponentsRecord {
  viewer: Viewer | null;
  /** What each `<epdf-menu-item>` picked said, in order. */
  readonly picked: string[];
  setWidth(width: string): void;
}

const record = checkRecord<ComponentsRecord>({ viewer: null, picked: [], setWidth: () => {} });

/** Where its toolbar item sits, as the item context says it. */
@Component({
  selector: 'app-where',
  template: `
    <span
      data-check="where"
      [attr.data-edge]="item.edge()"
      [attr.data-size]="item.size()"
      [attr.data-variant]="item.variant() ?? 'none'"
      style="display: inline-flex"
      [style.flex-direction]="item.orientation() === 'vertical' ? 'column' : 'row'"
      >{{ item.orientation() }}</span
    >
  `,
})
export class Where {
  protected readonly item = inject(EpdfToolbarItemContext);
}

/** Two sizes, as the item context picks: the toolbar must measure the one it draws. */
@Component({
  selector: 'app-sized',
  template: `
    <span
      data-check="sized"
      [attr.data-drawn]="item.variant() ?? 'none'"
      style="display: inline-block; overflow: hidden"
      [style.width.px]="item.variant() === 'short' ? 48 : 700"
      >Sized</span
    >
  `,
})
export class Sized {
  protected readonly item = inject(EpdfToolbarItemContext);
}

const layout: LayoutFunction = (base, env) => {
  const placed = base
    .add({ custom: 'where' }, { to: 'main', section: 'start' })
    .add(
      { custom: 'sized', variants: ['full', 'short'], command: 'zoom:in' },
      { to: 'main', section: 'start' },
    )
    .add({ custom: 'zoom-in' }, { to: 'main', section: 'start' })
    .add({ custom: 'share' }, { to: 'main', section: 'start' })
    .addPanel('notes', { side: 'end', title: 'Notes', icon: 'book' })
    .add('panel:notes', { to: 'main', section: 'end' });
  return env.width < 900 ? placed.place('main', 'start') : placed;
};

@Component({
  selector: 'app-root',
  imports: [
    EpdfPdfViewer,
    EpdfToolbarItem,
    EpdfPanel,
    EpdfRegion,
    EpdfButton,
    EpdfMenu,
    EpdfMenuItem,
    Where,
    Sized,
  ],
  template: `
    <epdf-pdf-viewer
      src="/sample.pdf"
      [layout]="layout"
      style="height: 100vh"
      [style.width]="width()"
      (ready)="ready($event)"
    >
      <ng-template epdfRegion="header">
        <header data-check="header">Acme Contracts</header>
      </ng-template>
      <ng-template epdfToolbarItem="where"><app-where /></ng-template>
      <ng-template epdfToolbarItem="sized"><app-sized /></ng-template>
      <ng-template epdfToolbarItem="zoom-in"><epdf-button command="zoom:in" /></ng-template>
      <ng-template epdfToolbarItem="share">
        <epdf-menu icon="link" label="Share">
          <epdf-menu-item icon="copy" (select)="pick('copy')">Copy link</epdf-menu-item>
          <epdf-menu-item icon="message" (select)="pick('email')">Email a link</epdf-menu-item>
        </epdf-menu>
      </ng-template>
      <ng-template epdfPanel="notes">
        <textarea data-check="notes" placeholder="Your notes"></textarea>
      </ng-template>
      <ng-template epdfRegion="footer">
        <footer data-check="footer">Saved a minute ago</footer>
      </ng-template>
    </epdf-pdf-viewer>
  `,
})
export class App {
  protected readonly layout = layout;
  protected readonly width = signal('100%');

  constructor() {
    record.setWidth = (width) => this.width.set(width);
  }

  protected ready(viewer: Viewer): void {
    record.viewer = viewer;
  }

  protected pick(name: string): void {
    record.picked.push(name);
  }
}

boot(App);
