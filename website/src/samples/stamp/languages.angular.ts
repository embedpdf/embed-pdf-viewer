import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfStamp, withStamp, type StampAsset } from '@embedpdf/angular/stamp';
import { LOCALES, loadDefaultLibrary } from '@embedpdf/default-stamps/library';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
const assetEngine = engine; // stamp libraries are PDFs; they open here too

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

@Component({
  selector: 'button[demoStampButton]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    type: 'button',
    class: 'button',
    '[title]': 'asset().label',
    '[attr.aria-pressed]': 'armed()',
    '(click)': 'toggle()',
  },
  template: `
    @if (url(); as url) {
      <img [src]="url" [alt]="asset().label" class="preview" />
    } @else {
      {{ asset().label }}
    }
  `,
})
export class StampButton {
  readonly asset = input.required<StampAsset>();
  readonly armed = input(false);

  private readonly stamp = inject(EpdfStamp);
  protected readonly url = this.stamp.previewUrlOf(() => this.asset().id);

  protected toggle() {
    if (this.armed()) this.stamp.disarm();
    else void this.stamp.armAsset(this.asset().id);
  }
}

@Component({
  selector: 'demo-language-picker',
  imports: [StampButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <select #picker class="field" aria-label="Language" (change)="locale.set(picker.value)">
        @for (code of locales; track code) {
          <option [value]="code" [selected]="code === locale()">{{ code }}</option>
        }
      </select>
      @for (asset of shown(); track asset.id) {
        <button demoStampButton [asset]="asset" [armed]="armedAsset()?.id === asset.id"></button>
      }
      <span class="spacer"></span>
      <output class="readout">{{ library()?.name ?? 'Loading…' }}</output>
    </div>
  `,
})
export class LanguagePicker {
  private readonly stamp = inject(EpdfStamp);
  protected readonly locales = LOCALES;
  protected readonly locale = signal('nl');
  protected readonly library = computed(() => this.stamp.libraries()[0]);
  private readonly assets = this.stamp.assetsOf(() => ({ libraryId: this.library()?.id }));
  protected readonly shown = computed(() => this.assets().slice(0, 4));
  protected readonly armedAsset = this.stamp.armedAsset;

  constructor() {
    // The library of the chosen language replaces the one before: the same identifiers,
    // translated labels. Dutch on load.
    effect((onCleanup) => {
      const locale = this.locale();
      let current = true;
      onCleanup(() => (current = false));
      void loadDefaultLibrary(locale).then(async (bytes) => {
        if (!current) return;
        for (const old of this.stamp.listLibraries()) await this.stamp.deleteLibrary(old.id);
        if (current) await this.stamp.importLibrary(bytes);
      });
    });
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    LanguagePicker,
  ],
  providers: [
    provideEmbedPdf(
      { engine, initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
      withStamp({ assetEngine }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './languages.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-language-picker />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer [annotations]="false" />
          <epdf-annotation-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
