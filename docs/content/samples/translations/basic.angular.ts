import { ChangeDetectionStrategy, Component, inject, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfCommand, standardCommands, withCommands } from '@embedpdf/angular/commands';
import { EpdfI18n, EpdfTPipe, withI18n } from '@embedpdf/angular/i18n';
import type { Locale } from '@embedpdf/angular/i18n';
import { localEngine } from '@embedpdf/engine';

// Your strings. The buttons' labels are the standard commands', which come translated.
const en: Locale = {
  code: 'en',
  name: 'English',
  translations: {
    app: { language: 'Language', pages: { one: '{count} page', other: '{count} pages' } },
  },
};
const nl: Locale = {
  code: 'nl',
  name: 'Nederlands',
  translations: {
    app: { language: 'Taal', pages: { one: '{count} pagina', other: "{count} pagina's" } },
  },
};

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfCommand, EpdfTPipe],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withCommands({ commands: standardCommands }),
      withI18n({
        locale: 'nl',
        locales: [en, nl],
        // Loaded the first time someone picks them; in your app, `() => import('./locales/de')`.
        loaders: {
          de: async () => ({
            code: 'de',
            name: 'Deutsch',
            translations: {
              app: { language: 'Sprache', pages: { one: '{count} Seite', other: '{count} Seiten' } },
            },
          }),
          ja: async () => ({
            code: 'ja',
            name: '日本語',
            translations: { app: { language: '言語', pages: { other: '{count} ページ' } } },
          }),
        },
      }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './basic.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <label class="picker">
          {{ 'app.language' | epdfT }}
          <select
            #picker
            class="select"
            [disabled]="i18n.loading() !== null"
            (change)="i18n.setLocale(picker.value)"
          >
            @for (language of i18n.locales(); track language.code) {
              <option [value]="language.code" [selected]="language.code === i18n.locale()">
                {{ language.name }}
              </option>
            }
          </select>
        </label>
        @for (id of commands; track id) {
          <button type="button" class="button" [epdfCommand]="id" #command="epdfCommand">
            {{ command.label() }}
          </button>
        }
        <output class="count">
          {{ 'app.pages' | epdfT: { params: { count: stage.pageCount() } } }}
        </output>
      </div>
      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">…</p></ng-template>
  `,
})
export class App {
  // The component that provides the viewer can inject its services itself.
  protected readonly i18n = inject(EpdfI18n);
  protected readonly commands = ['page:previous', 'page:next', 'zoom:in', 'document:print'];
}
