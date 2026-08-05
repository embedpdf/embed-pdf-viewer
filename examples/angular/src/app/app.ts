/**
 * The root: chooses the engine + plugin set and mounts the viewer. Everything
 * that READS the kernel lives in <app-workspace>, INSIDE <epdf-viewer>, where
 * the host is injectable. One import line per feature.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EpdfViewer } from '@embedpdf/angular/runtime';
import { stagePlugin } from '@embedpdf/angular/stage';
import { renderPlugin } from '@embedpdf/angular/render';
import { createEngine } from './engine';
import { Workspace } from './workspace';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EpdfViewer, Workspace],
  template: `
    <epdf-viewer [engine]="engine" [plugins]="plugins">
      <app-workspace />
    </epdf-viewer>
  `,
})
export class App {
  // Thunk form: the host constructs the engine when the kernel materializes
  // and destroys it on teardown.
  readonly engine = createEngine;
  readonly plugins = [stagePlugin(), renderPlugin()];
}
