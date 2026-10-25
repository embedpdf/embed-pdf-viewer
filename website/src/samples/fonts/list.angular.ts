import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { Font, FontRestriction, OpenInput } from '@embedpdf/angular/runtime';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotation, withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfFonts, withFonts } from '@embedpdf/angular/fonts';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const GROUPS = [
  ['document', 'In this document'],
  ['engine', 'The engine’s fonts'],
  ['standard', 'Standard'],
] as const;

// Why a font can't be chosen for new text, by its first restriction.
const WHY: Record<FontRestriction, string> = {
  subset: 'holds only the characters its text uses',
  'not-embedded': 'the file only names it',
  'preview-and-print': 'licensed for viewing and printing only',
  'unsupported-format': 'new text is written in TrueType or OpenType',
  'no-unicode-map': 'doesn’t say which characters it draws',
  'not-served': 'stays on the server',
};

// Every font the document can be written in, grouped by where it comes from.
@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withInteraction(),
      withAnnotation(),
      withFonts(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './list.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <section *epdfDocumentGate="let document; fallback: loading" class="panel">
      <header class="panel-header">
        <h3 class="panel-title">Fonts</h3>
        <button type="button" class="button" (click)="writeHebrew()">Write in Hebrew</button>
        <span class="status" [attr.data-status]="fonts.status()">{{ fonts.status() }}</span>
      </header>
      @for (group of groups(); track group.source) {
        <div class="group">
          <h4 class="group-title">{{ group.title }}</h4>
          @if (group.fonts.length === 0) {
            <p class="empty">None</p>
          } @else {
            <ul class="chips">
              @for (font of group.fonts; track font.name) {
                @let why = whyOf(font);
                <li class="chip" [attr.data-choosable]="font.canChoose">
                  <span class="chip-name">{{ font.name }}</span>
                  @if (why) {
                    <span class="chip-why">{{ why }}</span>
                  }
                </li>
              }
            </ul>
          }
        </div>
      }
    </section>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly fonts = inject(EpdfFonts);
  private readonly annotation = inject(EpdfAnnotation);
  private readonly document = inject(EpdfDocument);

  protected readonly groups = computed(() =>
    GROUPS.map(([source, title]) => ({
      source,
      title,
      fonts: this.fonts.list()?.fonts.filter((font) => font.source === source) ?? [],
    })),
  );

  protected whyOf(font: Font) {
    return font.canChoose ? null : WHY[font.restrictions[0] ?? 'unsupported-format'];
  }

  // The engine fills Hebrew in from a Hebrew font and puts it in the file: the list reads it.
  protected async writeHebrew() {
    const cover = this.document.pages()[0]?.ref;
    if (!cover) return;
    await this.annotation.create(cover, {
      subtype: 'free-text',
      box: { x: 72, y: 72, width: 220, height: 40 },
      contents: 'שלום עולם',
      fontFamily: 'helvetica',
    });
  }
}
