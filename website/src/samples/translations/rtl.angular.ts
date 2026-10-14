import { ChangeDetectionStrategy, Component, inject, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfCommand, standardCommands, withCommands } from '@embedpdf/angular/commands';
import { EpdfI18n, EpdfTPipe, withI18n } from '@embedpdf/angular/i18n';
import type { Locale } from '@embedpdf/angular/i18n';
import { localEngine } from '@embedpdf/engine';

const en: Locale = {
  code: 'en',
  name: 'English',
  translations: { app: { title: 'The ebook', switchTo: 'العربية' } },
};
// Arabic reads right to left. The standard commands have no Arabic labels, so the app gives
// them, under the same keys.
const ar: Locale = {
  code: 'ar',
  name: 'العربية',
  direction: 'rtl',
  translations: {
    app: { title: 'الكتاب الإلكتروني', switchTo: 'English' },
    commands: {
      page: { previous: 'الصفحة السابقة', next: 'الصفحة التالية' },
      zoom: { in: 'تكبير', out: 'تصغير' },
    },
  },
};

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// The toolbar follows the language: in Arabic it runs from right to left.
@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfCommand, EpdfTPipe],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withCommands({ commands: standardCommands }),
      withI18n({ locale: 'ar', locales: [en, ar] }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './rtl.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div *epdfDocumentGate="let document; fallback: loading" [dir]="i18n.direction()" class="root">
      <div class="toolbar">
        <strong class="title">{{ 'app.title' | epdfT }}</strong>
        @for (id of commands; track id) {
          <button type="button" class="button" [epdfCommand]="id" #command="epdfCommand">
            {{ command.label() }}
          </button>
        }
        <button type="button" class="button switch" (click)="switchLanguage()">
          {{ 'app.switchTo' | epdfT }}
        </button>
      </div>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </div>

    <ng-template #loading><p class="loading">…</p></ng-template>
  `,
})
export class App {
  protected readonly i18n = inject(EpdfI18n);
  protected readonly commands = ['page:previous', 'page:next', 'zoom:out', 'zoom:in'];

  protected switchLanguage() {
    void this.i18n.setLocale(this.i18n.locale() === 'ar' ? 'en' : 'ar');
  }
}
