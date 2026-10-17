import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, isPluginError, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfMetadata, withMetadata } from '@embedpdf/angular/metadata';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Your own fields, kept in the document: add one, change one, remove one.
@Component({
  selector: 'demo-custom-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <table class="fields">
        <thead>
          <tr>
            <th>Name</th>
            <th>Value</th>
            <th aria-label="Remove"></th>
          </tr>
        </thead>
        <tbody>
          @for (field of fields(); track field[0]) {
            <tr>
              <td class="key">{{ field[0] }}</td>
              <td>{{ field[1] }}</td>
              <td>
                <!-- null removes a field; the others stay as they are. -->
                <button
                  type="button"
                  class="button quiet"
                  [disabled]="!metadata.canUpdate()"
                  (click)="remove(field[0])"
                >
                  Remove
                </button>
              </td>
            </tr>
          }
        </tbody>
      </table>
      <form class="add" (submit)="$event.preventDefault(); add()">
        <input
          #nameField
          class="field"
          aria-label="Name"
          placeholder="Name, such as approvedOn"
          [value]="name()"
          (input)="name.set(nameField.value)"
        />
        <input
          #valueField
          class="field"
          aria-label="Value"
          placeholder="Value"
          [value]="value()"
          (input)="value.set(valueField.value)"
        />
        <button type="submit" class="button" [disabled]="!metadata.canUpdate() || !name().trim()">
          Add
        </button>
      </form>
      @if (error(); as error) {
        <p class="error">{{ error }}</p>
      }
    </section>
  `,
})
export class CustomFields {
  protected readonly metadata = inject(EpdfMetadata);
  protected readonly fields = computed(() => Object.entries(this.metadata.custom.fields() ?? {}));
  protected readonly name = signal('');
  protected readonly value = signal('');
  protected readonly error = signal<string | null>(null);

  constructor() {
    // Two fields of our own, written on load. Setting the same values again changes nothing.
    void this.metadata.custom.update({ contractId: 'C-2026-114', reviewedBy: 'dana' });
  }

  protected async add() {
    try {
      await this.metadata.custom.update({ [this.name().trim()]: this.value() });
      this.name.set('');
      this.value.set('');
      this.error.set(null);
    } catch (failure) {
      // A name the PDF can't take, such as one of the standard fields.
      if (isPluginError(failure, 'invalid-input')) this.error.set(failure.message);
      else throw failure;
    }
  }

  protected remove(key: string) {
    void this.metadata.custom.update({ [key]: null });
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, CustomFields],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withMetadata(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './custom-fields.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <demo-custom-fields *epdfDocumentGate="let document; fallback: loading" />

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
