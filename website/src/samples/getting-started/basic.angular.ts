import { ChangeDetectionStrategy, Component } from '@angular/core';
import { localEngine } from '@embedpdf/engine';
import { EpdfViewer, injectDocumentId } from '@embedpdf/angular/runtime';
import type { EpdfInitialDocument, OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, stagePlugin } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, renderPlugin } from '@embedpdf/angular/render';

// The local engine opens bytes: fetch lazily, under the loading tab.
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Kernel readers live INSIDE <epdf-viewer>, where the host is injectable —
// and document UI is gated on having a document.
@Component({
  selector: 'demo-workspace',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  template: `
    @if (documentId()) {
      <epdf-stage style="display: block; height: 100%">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    } @else {
      <p>Loading…</p>
    }
  `,
})
export class Workspace {
  readonly documentId = injectDocumentId();
}

@Component({
  selector: 'demo-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EpdfViewer, Workspace],
  template: `
    <epdf-viewer [engine]="engine" [plugins]="plugins" [initialDocuments]="initialDocuments">
      <div style="height: 500px">
        <demo-workspace />
      </div>
    </epdf-viewer>
  `,
})
export class App {
  // The engine is created synchronously and costs nothing until first use, so
  // a field initializer is safe. The viewer warms it up when the kernel
  // materializes; only opening a document does real work — the UI renders
  // at t≈0.
  readonly engine = localEngine();
  readonly plugins = [stagePlugin(), renderPlugin()];
  readonly initialDocuments: EpdfInitialDocument[] = [{ source: ebook }];
}
