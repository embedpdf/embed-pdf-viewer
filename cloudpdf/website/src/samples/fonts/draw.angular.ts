import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfFonts, injectFontCss, withFonts } from '@embedpdf/angular/fonts';
import { cloudEngine } from '@cloudpdf/engine';

const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };

// Type in any font the document can be written in, drawn as the engine will write it.
@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine(), initialDocuments: [{ source: welcome }] },
      withFonts(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './draw.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <section *epdfDocumentGate="let document; fallback: loading" class="panel">
      <label class="field">
        Font
        <select #fontField (change)="font.set(fontField.value)">
          @for (entry of choosable(); track entry.name) {
            <option [value]="entry.name" [selected]="entry.name === font()">
              {{ entry.name }}
            </option>
          }
        </select>
      </label>
      <textarea
        class="preview"
        [style.font-family]="css()?.fontFamily"
        [style.font-weight]="css()?.fontWeight"
        [style.font-style]="css()?.fontStyle"
        style="font-synthesis: none"
      >
Hello שלום مرحبا 你好</textarea
      >
      <p class="hint">Characters no font has show as boxes, as the engine writes them.</p>
    </section>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly fonts = inject(EpdfFonts);
  protected readonly font = signal('times-roman');
  // The font's CSS, its programs mounted while this component lives.
  protected readonly css = injectFontCss(() => this.font());
  protected readonly choosable = computed(
    () => this.fonts.list()?.fonts.filter((entry) => entry.canChoose) ?? [],
  );
}
