import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  linkedSignal,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, EpdfDocuments, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { DocumentInfo, FailedDocumentInfo, OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// A file that isn't a PDF, so its document can't be opened.
const broken: OpenInput = { kind: 'bytes', bytes: new TextEncoder().encode('Not a PDF') };

@Component({
  selector: 'demo-password-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel">
      <h3>{{ document().name }} needs a password</h3>
      @if (wrong()) {
        <p>That password isn’t right. Try again.</p>
      }
      <div class="actions">
        <input
          #field
          class="field"
          type="password"
          aria-label="Password"
          [value]="password()"
          (input)="password.set(field.value)"
        />
        <button type="button" class="button" (click)="unlock()">Unlock</button>
      </div>
    </div>
  `,
})
export class PasswordForm {
  readonly document = input.required<DocumentInfo>();
  private readonly documents = inject(EpdfDocuments);
  protected readonly password = signal('');
  protected readonly wrong = linkedSignal(() => this.document().passwordProvided ?? false);

  protected async unlock() {
    try {
      await this.documents.unlock(this.document().id, { password: this.password() });
    } catch {
      this.wrong.set(true); // it stays locked; ask again
    }
  }
}

@Component({
  selector: 'demo-open-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel" data-tone="error">
      <h3>Couldn’t open {{ document().name }}</h3>
      <p>{{ document().error.message }}</p>
      <div class="actions">
        <button type="button" class="button" (click)="documents.retry(document().id)">
          Try again
        </button>
        <button type="button" class="button" (click)="documents.close(document().id)">Close</button>
      </div>
    </div>
  `,
})
export class OpenError {
  readonly document = input.required<FailedDocumentInfo>();
  protected readonly documents = inject(EpdfDocuments);
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    PasswordForm,
    OpenError,
  ],
  providers: [
    provideEmbedPdf(
      {
        engine: () => localEngine(),
        initialDocuments: [
          { source: ebook, name: 'ebook.pdf' },
          { source: broken, name: 'broken.pdf', active: true },
        ],
      },
      withStage(),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './states.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="tabs" role="tablist">
      @for (document of documents.documents(); track document.id) {
        <button
          type="button"
          role="tab"
          class="tab"
          [attr.aria-selected]="document.id === documents.activeId()"
          (click)="documents.setActive(document.id)"
        >
          <span class="status" [attr.data-status]="document.status"></span>
          {{ document.name }}
        </button>
      }
    </div>

    <epdf-stage
      *epdfDocumentGate="let ready; fallback: opening; locked: locked; error: failed"
      class="stage"
    >
      <ng-template epdfPage>
        <epdf-render-layer />
      </ng-template>
    </epdf-stage>

    <ng-template #opening><div class="panel">Opening…</div></ng-template>
    <ng-template #locked let-document>
      <demo-password-form [document]="document" />
    </ng-template>
    <ng-template #failed let-document>
      <demo-open-error [document]="document" />
    </ng-template>
  `,
})
export class App {
  protected readonly documents = inject(EpdfDocuments);
}
