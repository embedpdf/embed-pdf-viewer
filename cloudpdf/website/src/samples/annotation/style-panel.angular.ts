import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  EpdfAnnotation,
  EpdfAnnotationLayer,
  withAnnotation,
  type AnnotationProperty,
  type LineEnding,
} from '@embedpdf/angular/annotation';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// One control per property, by the control it asks for.
@Component({
  selector: 'demo-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (property(); as property) {
      @if (property.control === 'color') {
        <span class="pair">
          <input
            #picker
            type="color"
            class="color"
            [attr.aria-label]="property.label"
            [value]="stringValue() ?? '#ffffff'"
            (input)="update(picker.value)"
          />
          @if (property.key === 'interiorColor') {
            <button type="button" class="link" (click)="update(null)">
              {{ value() === null ? 'none' : 'remove' }}
            </button>
          }
        </span>
      } @else if (property.control === 'number') {
        <span class="pair">
          <input
            #slider
            type="range"
            [attr.aria-label]="property.label"
            [min]="property.min"
            [max]="property.max"
            [step]="property.step"
            [value]="numberValue() ?? property.min"
            (input)="update(+slider.value)"
          />
          <output class="value">{{ isMixed() ? 'mixed' : shown() }}</output>
        </span>
      } @else if (property.control === 'choice' && property.key === 'lineEndings') {
        <select #end class="select" aria-label="Line end" (change)="setLineEnd(end.value)">
          @for (option of property.options; track option) {
            <option [selected]="option === lineEnd()">{{ option }}</option>
          }
        </select>
      } @else if (property.control === 'choice' && property.key === 'borderStyle') {
        <select
          #border
          class="select"
          [attr.aria-label]="property.label"
          (change)="setBorder(border.value)"
        >
          @if (isMixed()) {
            <option value="" selected>mixed</option>
          }
          @for (option of property.options; track option) {
            <option [selected]="!isMixed() && option === borderStyle()">{{ option }}</option>
          }
        </select>
      } @else if (property.control === 'choice') {
        <select
          #choice
          class="select"
          [attr.aria-label]="property.label"
          (change)="update(choice.value)"
        >
          @if (isMixed()) {
            <option value="" selected>mixed</option>
          }
          @for (option of property.options; track option) {
            <option [selected]="!isMixed() && option === shown()">{{ option }}</option>
          }
        </select>
      } @else if (property.control === 'flag') {
        <input
          #flag
          type="checkbox"
          [attr.aria-label]="property.label"
          [checked]="value() === true"
          (change)="update(flag.checked)"
        />
      } @else if (property.control === 'textFormat') {
        <button
          type="button"
          class="toggle"
          [attr.aria-pressed]="value() === true"
          (click)="annotation.text.toggleFormat(property.format)"
        >
          {{ property.label }}
        </button>
      } @else if (property.control === 'text') {
        <input
          #field
          class="text"
          [attr.aria-label]="property.label"
          [value]="stringValue() ?? ''"
          (input)="update(field.value)"
        />
      } @else if (property.control === 'link') {
        <select
          #link
          class="select"
          [attr.aria-label]="property.label"
          (change)="setLink(link.value)"
        >
          <option value="none" [selected]="!value()">No link</option>
          <option value="website" [selected]="!!value()">embedpdf.com</option>
        </select>
      }
    }
  `,
})
export class Control {
  readonly property = input.required<AnnotationProperty>();

  protected readonly annotation = inject(EpdfAnnotation);
  private readonly panel = this.annotation.selection.properties;
  protected readonly value = computed(() => this.panel().values[this.property().key]);
  protected readonly isMixed = computed(() => this.panel().mixed.includes(this.property().key));
  protected readonly stringValue = computed(() => {
    const value = this.value();
    return typeof value === 'string' ? value : null;
  });
  protected readonly numberValue = computed(() => {
    const value = this.value();
    return typeof value === 'number' ? value : null;
  });
  /** The value as a readout or a `<select>` shows it. */
  protected readonly shown = computed(() => String(this.value() ?? ''));

  protected update(next: unknown) {
    void this.annotation.selection.update({ [this.property().key]: next });
  }

  // Line endings are a pair: this sets the end, and each line keeps its own start.
  protected readonly lineEnd = computed(
    () => (this.value() as { end?: string } | undefined)?.end ?? 'none',
  );

  protected setLineEnd(value: string) {
    const next = value as LineEnding;
    void this.annotation.selection.update((member) =>
      member.subtype === 'line' ? { lineEndings: { ...member.lineEndings, end: next } } : {},
    );
  }

  // The border is three fields: its style, its dashes, and how cloudy it is.
  protected readonly borderStyle = computed(() =>
    this.panel().values.cloudyIntensity ? 'cloudy' : String(this.value()),
  );

  protected setBorder(next: string) {
    void this.annotation.selection.update({
      borderStyle: next === 'dashed' ? 'dashed' : 'solid',
      dashArray: next === 'dashed' ? [4, 3] : null,
      cloudyIntensity: next === 'cloudy' ? 1 : null,
    });
  }

  protected setLink(value: string) {
    void this.annotation.selection.updateLink(
      value === 'website' ? { kind: 'uri', uri: 'https://www.embedpdf.com' } : null,
    );
  }
}

// What the selection can change, with its current values.
@Component({
  selector: 'demo-style-panel',
  imports: [Control],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (panel().properties.length === 0) {
      <p class="panel empty">Select an annotation</p>
    } @else {
      <dl class="panel properties">
        @for (property of panel().properties; track property.key) {
          <div class="property">
            <dt>{{ property.label }}</dt>
            <dd><demo-control [property]="property" /></dd>
          </div>
        }
      </dl>
    }
  `,
})
export class StylePanel {
  protected readonly panel = inject(EpdfAnnotation).selection.properties;
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    StylePanel,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './style-panel.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="viewer">
        <epdf-stage class="stage">
          <ng-template epdfPage>
            <epdf-render-layer [annotations]="false" />
            <epdf-annotation-layer />
          </ng-template>
        </epdf-stage>
        <demo-style-panel />
      </div>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly annotation = inject(EpdfAnnotation);
  private readonly document = inject(EpdfDocument);
  private added = false;

  constructor() {
    // On load: a rectangle (selected), an arrow and a text box on the cover.
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (this.annotation.status() !== 'ready' || !cover || this.added) return;
      this.added = true;
      untracked(() => {
        void this.annotation.create(cover, {
          subtype: 'line',
          linePoints: { start: { x: 520, y: 120 }, end: { x: 470, y: 230 } },
          lineEndings: { start: 'none', end: 'closed-arrow' },
          color: '#1a2748',
          strokeWidth: 3,
        });
        void this.annotation.create(cover, {
          subtype: 'free-text',
          box: { x: 300, y: 512, width: 230, height: 40 },
          contents: 'Ready for review',
          fontSize: 16,
          fontColor: '#1a2748',
        });
        void this.annotation.create(
          cover,
          {
            subtype: 'square',
            box: { x: 96, y: 506, width: 178, height: 54 },
            color: '#e5484d',
            interiorColor: '#ffe4e1',
            strokeWidth: 3,
          },
          undefined,
          { select: true },
        );
      });
    });
  }
}
