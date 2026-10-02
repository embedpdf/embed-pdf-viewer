import { ChangeDetectionStrategy, Component, inject, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { DocumentMetadata, OpenInput } from '@embedpdf/angular/runtime';
import { EpdfMetadata, withMetadata } from '@embedpdf/angular/metadata';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const FIELDS = [
  ['title', 'Title'],
  ['author', 'Author'],
  ['subject', 'Subject'],
  ['keywords', 'Keywords'],
  ['creator', 'Made in'],
  ['producer', 'Turned into a PDF by'],
  ['createdAt', 'Created'],
  ['modifiedAt', 'Last changed'],
  ['trapped', 'Trapped'],
] as const;

// Dates are ISO strings: show them in the reader's own format.
const DATES: ReadonlySet<string> = new Set(['createdAt', 'modifiedAt']);
const show = (field: string, value: string | null) => {
  if (value === null) return null;
  return DATES.has(field) ? new Date(value).toLocaleString() : value;
};

// The document's properties, the way a "Document properties" dialog shows them.
@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withMetadata(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './properties.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <section *epdfDocumentGate="let document; fallback: loading" class="panel">
      <header class="panel-header">
        <h3 class="panel-title">Document properties</h3>
        <span class="status" [attr.data-status]="metadata.status()">
          {{ metadata.status() }}
        </span>
      </header>
      <dl class="properties">
        @for (entry of fields; track entry[0]) {
          @let value = valueOf(entry[0], metadata.fields());
          <div class="property">
            <dt>{{ entry[1] }}</dt>
            <dd [class.unset]="value === null">{{ value ?? 'not set' }}</dd>
          </div>
        }
      </dl>
    </section>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly metadata = inject(EpdfMetadata);
  protected readonly fields = FIELDS;

  protected valueOf(field: (typeof FIELDS)[number][0], metadata: DocumentMetadata | null) {
    return metadata ? show(field, metadata[field]) : null;
  }
}
