import { Component, inject } from '@angular/core';
import { copyImage, saveFile } from '@embedpdf/angular/runtime';
import { EpdfRender, type Snapshot } from '@embedpdf/angular/render';

// Beside the pages: copy the snapshot, or save it as a file
@Component({
  selector: 'app-snapshot-actions',
  template: `
    @if (render.getSnapshot(); as snapshot) {
      <div class="snapshot-actions">
        <!-- In the click itself, not after an await: the picture follows when it's there -->
        <button (click)="copy(snapshot)">Copy</button>
        <button (click)="save(snapshot)">Save</button>
      </div>
    }
  `,
})
export class SnapshotActions {
  protected readonly render = inject(EpdfRender);

  protected copy(snapshot: Snapshot) {
    void copyImage(snapshot.image);
  }

  protected async save(snapshot: Snapshot) {
    saveFile(await (await snapshot.image).blob(), 'snapshot.png');
  }
}
