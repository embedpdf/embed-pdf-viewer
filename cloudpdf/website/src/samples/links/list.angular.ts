import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { withActions, withActionsUi } from '@embedpdf/angular/actions';
import { EpdfLink, EpdfLinkLayer, withLink } from '@embedpdf/angular/link';
import type { Link } from '@embedpdf/angular/link';
import { cloudEngine } from '@cloudpdf/engine';

const links: OpenInput = { kind: 'grant', grant: 'shr_xs-9Y5qwuYrJ2BKtWzuo_2xy' };

// The first page's links, read from the plugin, each with a button that follows it.
@Component({
  selector: 'aside[demoLinkList]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'panel' },
  template: `
    <h3 class="heading">Links on page 1</h3>
    <ul class="links">
      @for (item of items(); track item.id) {
        <li class="link">
          <span class="kind">{{ item.target.kind }}</span>
          <span class="label">{{ link.getLabel(item) }}</span>
          <span class="where">at {{ round(item.bounds.x) }}, {{ round(item.bounds.y) }}</span>
          <button type="button" class="button" (click)="link.activate(item)">Follow</button>
        </li>
      }
    </ul>
    <p class="last">
      <code>activated$</code> {{ last() ?? 'not yet' }}
    </p>
  `,
})
export class LinkList {
  protected readonly link = inject(EpdfLink);
  protected readonly items = signal<readonly Link[]>([]);
  protected readonly last = signal<string | null>(null);
  protected readonly round = Math.round;

  constructor() {
    void this.link.ensureLoaded(0).then(() => this.items.set(this.link.listLinks(0)));

    // Every way of following a link ends up here: a click, a key, or code.
    this.link.activated$
      .pipe(takeUntilDestroyed())
      .subscribe(({ target, activation }) => this.last.set(`${target.kind} → ${activation.outcome}`));
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfLinkLayer,
    LinkList,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine(), initialDocuments: [{ source: links }] },
      withStage(),
      withRender(),
      withInteraction(),
      // The actions plugin runs a link that names a viewer command, such as the footer's Next.
      withActions(),
      // The browser's way to open a website, once for the viewer.
      withActionsUi(),
      withLink(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './list.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="layout">
        <aside demoLinkList></aside>
        <epdf-stage class="stage">
          <ng-template epdfPage>
            <epdf-render-layer />
            <epdf-link-layer />
          </ng-template>
        </epdf-stage>
      </div>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
