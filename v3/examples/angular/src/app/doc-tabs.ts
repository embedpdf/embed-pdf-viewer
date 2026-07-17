/**
 * Workspace chrome: the reactive document registry (tabs) + an open action.
 * Lives OUTSIDE the document gate — it renders while no document exists and
 * while the engine is still booting.
 */
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { injectDocuments } from '@embedpdf-x/angular/runtime';
import { sampleSource } from './engine';

@Component({
  selector: 'app-doc-tabs',
  standalone: true,
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
    @for (doc of documents.docs(); track doc.id) {
      <button
        class="tab"
        [class.active]="doc.id === documents.activeId()"
        (click)="documents.setActive(doc.id)"
      >
        {{ doc.name ?? doc.id }} · {{ doc.pageCount }}p
      </button>
    }
    <button class="open" [disabled]="opening()" (click)="openCopy()">＋ Open copy</button>
  `,
})
export class DocTabs {
  protected readonly documents = injectDocuments();
  protected readonly opening = signal(false);
  private seq = 0;

  protected async openCopy(): Promise<void> {
    this.opening.set(true);
    try {
      this.seq += 1;
      const id = `ebook-copy-${this.seq}`;
      await this.documents.open(await sampleSource(id, '/ebook.pdf'), {
        name: `Copy ${this.seq}`,
      });
    } catch (err) {
      console.error('[example] open failed', err);
    } finally {
      this.opening.set(false);
    }
  }
}
