/**
 * The root: chooses the engine + plugin set and mounts the viewer. Everything
 * that READS the kernel lives in <app-workspace>, INSIDE <epdf-viewer>, where
 * the host is injectable. One import line per feature (ADAPTERS.md).
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EpdfViewer } from '@embedpdf-x/angular/runtime';
import { stagePlugin } from '@embedpdf-x/angular/stage';
import { renderPlugin } from '@embedpdf-x/angular/render';
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
  readonly engine = createEngine();
  readonly plugins = [stagePlugin(), renderPlugin()];
}
