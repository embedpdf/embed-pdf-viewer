/**
 * The tabs: every open document and an open button. Workspace UI, so it renders while no
 * document is open and while the engine is still starting.
 */
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { EpdfDocuments } from '@embedpdf/angular/runtime';
import { sampleSource } from './engine';

@Component({
  selector: 'app-doc-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      background: #1f1f24;
    }
    .tab {
      padding: 4px 12px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #b6b6c2;
      cursor: pointer;
    }
    .tab.active {
      background: #3a3a44;
      color: #fff;
    }
    .open {
      margin-left: auto;
      padding: 4px 10px;
      border: 1px solid #4a4a55;
      border-radius: 6px;
      background: transparent;
      color: #b6b6c2;
      cursor: pointer;
    }
  `,
  template: `
    @for (document of documents.documents(); track document.id) {
      <button
        class="tab"
        [class.active]="document.id === documents.activeId()"
        (click)="documents.setActive(document.id)"
      >
        {{ document.name ?? document.id }} · {{ document.pageCount }}p
      </button>
    }
    <button class="open" [disabled]="opening()" (click)="openCopy()">＋ Open copy</button>
  `,
})
export class DocTabs {
  protected readonly documents = inject(EpdfDocuments);
  protected readonly opening = signal(false);
  private copies = 0;

  protected async openCopy(): Promise<void> {
    this.opening.set(true);
    try {
      this.copies += 1;
      const id = `ebook-copy-${this.copies}`;
      await this.documents.open(() => sampleSource(id, '/ebook.pdf'), {
        name: `Copy ${this.copies}`,
      });
    } catch (error) {
      console.error('[example] open failed', error);
    } finally {
      this.opening.set(false);
    }
  }
}
