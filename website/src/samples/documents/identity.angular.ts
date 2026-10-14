import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import {
  EpdfDocument,
  EpdfDocumentGate,
  EpdfDocuments,
  EpdfViewer,
  provideEmbedPdf,
} from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const dana = { userId: 'u_381', displayName: 'Dana Smith' };

// What each role may do, as permissions.
const roles = {
  reader: ['doc.open', 'doc.render', 'doc.text.select'],
  editor: [
    'doc.open',
    'doc.render',
    'doc.text.select',
    'doc.text.copy',
    'doc.download',
    'doc.print',
  ],
};
type Role = keyof typeof roles;

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      {
        engine: () => localEngine(),
        identity: dana,
        scope: roles.reader,
        initialDocuments: [{ source: ebook, name: 'ebook.pdf' }],
      },
      withStage(),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './identity.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="toolbar">
      <label class="label">
        Dana Smith, as
        <select #picker class="select" [value]="role()" (change)="role.set(asRole(picker.value))">
          <option value="reader">reader</option>
          <option value="editor">editor</option>
        </select>
      </label>
      <!-- Read the document's id too, so the checks are read again when it opens or closes. -->
      @let id = document.id();
      <span class="check" [attr.data-allowed]="!!id && documents.canDownload()"> Download </span>
      <span class="check" [attr.data-allowed]="!!id && documents.canPrint()">Print</span>
    </div>
    <p class="note">
      This document opened for a {{ openedAs() }}.
      @if (openedAs() !== role()) {
        <button type="button" class="button" (click)="openAgain()">
          Open it again as {{ role() }}
        </button>
      }
    </p>

    <epdf-stage *epdfDocumentGate="let ready; fallback: opening" class="stage">
      <ng-template epdfPage>
        <epdf-render-layer />
      </ng-template>
    </epdf-stage>

    <ng-template #opening><p class="loading">Opening…</p></ng-template>
  `,
})
export class App {
  protected readonly documents = inject(EpdfDocuments);
  protected readonly document = inject(EpdfDocument);
  protected readonly role = signal<Role>('reader');
  // The role the open document was opened with: it keeps that one.
  protected readonly openedAs = signal<Role>('reader');

  constructor() {
    // The viewer's scope follows the role; documents opened from now on get it.
    const viewer = inject(EpdfViewer);
    effect(() => viewer.updateSettings({ scope: roles[this.role()] }));
  }

  protected asRole(value: string): Role {
    return value as Role;
  }

  protected async openAgain() {
    const role = this.role();
    await this.documents.close(this.document.id());
    await this.documents.open(ebook, { name: 'ebook.pdf' });
    this.openedAs.set(role);
  }
}
