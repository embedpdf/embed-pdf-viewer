import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfOutline, withOutline } from '@embedpdf/angular/outline';
import type { OutlineItem, OutlineItemRef } from '@embedpdf/angular/outline';
import { localEngine } from '@embedpdf/engine';

const welcome = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-welcome.pdf');
  return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const same = (left: OutlineItemRef | null, right: OutlineItemRef | null) =>
  left?.objectNumber === right?.objectNumber;

// An outline being built: add items, nest them, fold them, rename and delete them.
@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: welcome }] },
      withOutline(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './nesting.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="editor">
        <div class="toolbar">
          <input
            #field
            class="field"
            aria-label="Title"
            [value]="title()"
            (input)="title.set(field.value)"
          />
          <button type="button" class="button" [disabled]="!outline.canEdit()" (click)="add(false)">
            Add
          </button>
          <button
            type="button"
            class="button"
            [disabled]="!outline.canEdit() || !item()"
            (click)="add(true)"
          >
            Add inside
          </button>
          <button
            type="button"
            class="button"
            [disabled]="!outline.canEdit() || !previous()"
            (click)="indent()"
          >
            Indent
          </button>
          <button
            type="button"
            class="button"
            [disabled]="!outline.canEdit() || !parent()"
            (click)="outdent()"
          >
            Outdent
          </button>
          <button
            type="button"
            class="button"
            [disabled]="!outline.canEdit() || !item()"
            (click)="rename()"
          >
            Rename
          </button>
          <button
            type="button"
            class="button"
            [disabled]="!outline.canEdit() || !item()"
            (click)="remove()"
          >
            Delete
          </button>
        </div>
        @if (outline.rows().length === 0) {
          <p class="empty">This document has no outline yet. Add an item.</p>
        } @else {
          <ul class="tree" role="tree">
            @for (row of outline.rows(); track row.item.ref.objectNumber) {
              <li
                class="row"
                role="treeitem"
                [attr.aria-level]="row.depth + 1"
                [attr.aria-expanded]="row.hasChildren ? row.expanded : null"
                [attr.aria-selected]="row.item.ref.objectNumber === item()?.ref?.objectNumber"
                [style.padding-inline-start.px]="6 + row.depth * 18"
              >
                <button
                  type="button"
                  class="chevron"
                  [attr.aria-label]="row.expanded ? 'Collapse' : 'Expand'"
                  [disabled]="!row.hasChildren"
                  [attr.data-expanded]="row.expanded || null"
                  (click)="outline.toggle(row.item.ref)"
                ></button>
                <button type="button" class="row-title" (click)="pick(row.item)">
                  {{ row.item.title }}
                </button>
              </li>
            }
          </ul>
        }
      </div>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly outline = inject(EpdfOutline);
  protected readonly title = signal('Chapter');
  protected readonly item = computed(() => {
    const [picked] = this.outline.selected();
    return this.outline.items().find((each) => same(each.ref, picked ?? null)) ?? null;
  });
  // The item before the picked one among its parent's children: where an indent puts it.
  protected readonly previous = computed(() => {
    const item = this.item();
    if (!item) return null;
    const siblings = this.outline.items().filter((each) => same(each.parent, item.parent));
    return siblings[siblings.indexOf(item) - 1] ?? null;
  });
  protected readonly parent = computed(() => {
    const item = this.item();
    return this.outline.items().find((each) => same(each.ref, item?.parent ?? null)) ?? null;
  });

  // After the picked item, or at the end.
  protected add(inside: boolean) {
    const item = this.item();
    const title = this.title();
    void this.outline.create(
      inside && item
        ? { title, parent: item.ref }
        : { title, parent: item?.parent ?? null, position: item ? { after: item.ref } : 'end' },
      { select: true },
    );
  }

  protected indent() {
    const item = this.item();
    const previous = this.previous();
    if (!item || !previous) return;
    void this.outline.move([item.ref], previous.ref, 'end');
    this.outline.expand(previous.ref);
  }

  protected outdent() {
    const item = this.item();
    const parent = this.parent();
    if (item && parent) void this.outline.move([item.ref], parent.parent, { after: parent.ref });
  }

  protected rename() {
    const item = this.item();
    if (item) void this.outline.update(item.ref, { title: this.title() });
  }

  protected remove() {
    const item = this.item();
    if (item) void this.outline.delete([item.ref]);
  }

  protected pick(item: OutlineItem) {
    this.outline.select([item.ref]);
    this.title.set(item.title);
  }
}
