import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  model,
  OnInit,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import {
  EpdfDocument,
  EpdfDocumentGate,
  EpdfDocuments,
  provideEmbedPdf,
} from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfMetadata, withMetadata } from '@embedpdf/angular/metadata';
import { localEngine } from '@embedpdf/engine';

// The original stays as it is: the document opens with a layer over it, and the changes go there.
const withLayer = async (layer?: Uint8Array): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return {
    kind: 'layerBytes',
    baseBytes: new Uint8Array(await response.arrayBuffer()),
    layer: layer ? { kind: 'artifact', bytes: layer } : { kind: 'fresh' },
  };
};

@Component({
  selector: 'demo-layer-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <input
        #field
        class="field"
        aria-label="Title"
        [value]="title()"
        (blur)="metadata.update({ title: field.value })"
      />
      <button type="button" class="button" (click)="keepChanges()">Keep the changes</button>
      <button type="button" class="button" [disabled]="!layer()" (click)="openAgain()">
        Open again with them
      </button>
    </div>
    <p class="note">
      @if (reopened()) {
        Opened again: the original, with the title from the stored layer.
      } @else if (layer(); as layer) {
        The layer holds the changes in {{ layer.byteLength.toLocaleString() }} bytes.
      } @else {
        Change the title, then keep the changes.
      }
    </p>
  `,
})
export class LayerBar implements OnInit {
  /** Whether the document was opened again with the stored layer. */
  readonly reopened = model(false);
  private readonly documents = inject(EpdfDocuments);
  private readonly document = inject(EpdfDocument);
  protected readonly metadata = inject(EpdfMetadata);
  protected readonly title = computed(() => this.metadata.fields()?.title ?? '');
  protected readonly layer = signal<Uint8Array | null>(null);

  ngOnInit() {
    // A change on load, so the layer has something in it. Opened again, the title comes from it.
    if (!this.reopened()) void this.metadata.update({ title: 'Reviewed by Dana' });
  }

  // Only the changes, as bytes you could store next to the original.
  protected async keepChanges() {
    this.layer.set(await this.documents.downloadLayer());
  }

  // Later: the original again, with the stored changes on top.
  protected async openAgain() {
    const layer = this.layer();
    if (!layer) return;
    // Said first: closing the document removes this bar, and then it can't say anything.
    this.reopened.set(true);
    await this.documents.close(this.document.id());
    await this.documents.open(() => withLayer(layer), { name: 'ebook.pdf' });
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, LayerBar],
  providers: [
    provideEmbedPdf(
      {
        engine: () => localEngine(),
        initialDocuments: [{ source: () => withLayer(), name: 'ebook.pdf' }],
      },
      withStage(),
      withRender(),
      withMetadata(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './layer.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: opening">
      <demo-layer-bar [(reopened)]="reopened" />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #opening><p class="loading">Opening…</p></ng-template>
  `,
})
export class App {
  protected readonly reopened = signal(false);
}
