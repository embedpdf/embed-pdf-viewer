import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { DocumentMetadata, OpenInput } from '@embedpdf/angular/runtime';
import { EpdfMetadata, withMetadata } from '@embedpdf/angular/metadata';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const EDITABLE = ['title', 'author', 'subject', 'keywords'] as const;
type Draft = Record<(typeof EDITABLE)[number], string>;

// A properties form: the inputs start with what the file says, and Save writes them back.
@Component({
  selector: 'demo-properties-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="layout">
      <form class="form" (submit)="$event.preventDefault(); save()">
        @for (key of editable; track key) {
          <label class="row">
            <span class="name">{{ key }}</span>
            <input
              #field
              class="field"
              placeholder="not set"
              [value]="draft()[key]"
              [disabled]="!metadata.canUpdate()"
              (input)="edit(key, field.value)"
            />
          </label>
        }
        <div class="actions">
          <button type="submit" class="button primary" [disabled]="!metadata.canUpdate()">
            Save
          </button>
          <button
            type="button"
            class="button"
            [disabled]="!metadata.canUpdate()"
            (click)="modifiedNow()"
          >
            Set the modified date to now
          </button>
        </div>
      </form>
      <section class="changes" aria-live="polite">
        <h3 class="changes-title">Changes</h3>
        <p class="modified">Last changed: {{ modifiedAt() }}</p>
        @if (changes().length === 0) {
          <p class="empty">Edit a field and save.</p>
        } @else {
          <ul class="log">
            @for (change of changes(); track changes().length - $index) {
              <li>{{ change }}</li>
            }
          </ul>
        }
      </section>
    </div>
  `,
})
export class PropertiesForm implements OnInit {
  /** The fields as the file has them when the form starts. */
  readonly initial = input.required<DocumentMetadata>();
  protected readonly metadata = inject(EpdfMetadata);
  protected readonly editable = EDITABLE;
  protected readonly draft = signal<Draft>({ title: '', author: '', subject: '', keywords: '' });
  protected readonly changes = signal<string[]>([]);
  protected readonly modifiedAt = computed(() => {
    const modifiedAt = this.metadata.fields()?.modifiedAt ?? null;
    return modifiedAt ? new Date(modifiedAt).toLocaleString() : 'not set';
  });

  constructor() {
    // Every change to the standard fields, by you or anyone else.
    this.metadata.updated$
      .pipe(takeUntilDestroyed())
      .subscribe(({ changedKeys, origin }) =>
        this.changes.update((list) => [
          `${changedKeys.join(', ')} changed ${origin.kind === 'local' ? 'here' : 'elsewhere'}`,
          ...list,
        ]),
      );
  }

  ngOnInit() {
    const initial = this.initial();
    this.draft.set({
      title: initial.title ?? '',
      author: initial.author ?? '',
      subject: initial.subject ?? '',
      keywords: initial.keywords ?? '',
    });
  }

  protected edit(key: keyof Draft, value: string) {
    this.draft.update((draft) => ({ ...draft, [key]: value }));
  }

  // An empty field removes it: null, not ''.
  protected save() {
    const draft = this.draft();
    void this.metadata.update({
      title: draft.title.trim() || null,
      author: draft.author.trim() || null,
      subject: draft.subject.trim() || null,
      keywords: draft.keywords.trim() || null,
    });
  }

  protected modifiedNow() {
    void this.metadata.update({ modifiedAt: new Date() });
  }
}

// The form starts once the properties have been read from the file.
@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, PropertiesForm],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withMetadata(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './edit.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      @if (metadata.fields(); as fields) {
        <demo-properties-form [initial]="fields" />
      } @else {
        <p class="loading">Reading…</p>
      }
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly metadata = inject(EpdfMetadata);
}
