import { ChangeDetectionStrategy, Component } from '@angular/core';
import { deferredEngine, EpdfViewer } from '@embedpdf/angular/runtime';
import type { Engine } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, stagePlugin } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, renderPlugin } from '@embedpdf/angular/render';

// The engine boots in a worker, in the background — the UI renders at t≈0
// and only opening a document awaits it.
function createEngine(): Engine {
  return deferredEngine(async () => {
    const { createLocalEngineWithWorker } = await import('@embedpdf/engine');
    const worker = new Worker(new URL('@embedpdf/engine/worker-entry', import.meta.url), {
      type: 'module',
    });
    return createLocalEngineWithWorker({ worker });
  });
}

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EpdfViewer, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  template: `
    <epdf-viewer [engine]="engine" [plugins]="plugins">
      <div style="height: 500px">
        <epdf-stage>
          <ng-template epdfPage>
            <epdf-render-layer />
          </ng-template>
        </epdf-stage>
      </div>
    </epdf-viewer>
  `,
})
export class App {
  readonly engine = createEngine();
  readonly plugins = [stagePlugin(), renderPlugin()];
}
