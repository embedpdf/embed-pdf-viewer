/**
 * The root: it provides the viewer (the engine, the documents to open, one feature per plugin)
 * and lays out the workspace. The components in its template share that viewer and inject its
 * services; this component could inject them too.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { withRender } from '@embedpdf/angular/render';
import { withStage } from '@embedpdf/angular/stage';
import { createEngine, sampleSource } from './engine';
import { Workspace } from './workspace';
import { DocTabs } from './doc-tabs';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DocTabs, Workspace],
  providers: [
    provideEmbedPdf(
      {
        // A function: the viewer makes the engine in the browser, and destroys it with this
        // component.
        engine: createEngine,
        initialDocuments: [{ source: () => sampleSource('ebook', '/ebook.pdf'), name: 'Ebook' }],
      },
      withStage(),
      withRender(),
    ),
  ],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
  `,
  template: `
    <!-- Workspace UI: outside the document gate, there from the first moment. -->
    <app-doc-tabs />
    <app-workspace />
  `,
})
export class App {}
