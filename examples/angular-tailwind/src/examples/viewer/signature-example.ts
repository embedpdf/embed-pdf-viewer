import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  signal,
} from '@angular/core';
import {
  createPluginCapabilitySignal,
  deserializeEntries,
  PDFViewer,
  type PluginRegistry,
  serializeEntries,
  type SignaturePlugin,
} from '@embedpdf/angular-pdf-viewer';

import {
  DEMO_DOCUMENT_URL,
  createThemeConfig,
  createThemePreferenceSignal,
} from '../../example-support';

const STORAGE_KEY = 'embedpdf-signatures';

const readStoredCount = (): number => {
  if (typeof localStorage === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as unknown[]).length : 0;
  } catch {
    return 0;
  }
};

export const selector = 'signature-example';

@Component({
  selector,
  imports: [PDFViewer],
  template: `
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="flex flex-wrap items-center gap-3">
          <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
            Persistence
          </span>
          <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              [disabled]="entryCount() === 0"
              (click)="save()"
            >
              Save ({{ entryCount() }})
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              [disabled]="storedCount() === 0"
              (click)="load()"
            >
              Load{{ storedCount() > 0 ? ' (' + storedCount() + ')' : '' }}
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              [disabled]="storedCount() === 0"
              (click)="clearStorage()"
            >
              Clear Storage
            </button>
          </div>
          <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
          <label
            class="inline-flex cursor-pointer items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300"
          >
            <input
              type="checkbox"
              class="accent-emerald-500"
              [checked]="autoSave()"
              (change)="autoSave.set($any($event.target).checked)"
            />
            Auto-save
          </label>
          @if (status()) {
            <span class="text-xs text-gray-500 dark:text-gray-400">{{ status() }}</span>
          }
        </div>
        @if (storedCount() > 0) {
          <div class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            {{ storedCount() }} signature{{ storedCount() !== 1 ? 's' : '' }} in localStorage
          </div>
        }
      </div>

      <div
        class="h-[600px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
      >
        <embedpdf-viewer
          class="block h-full w-full"
          [config]="viewerConfig()"
          (ready)="onReady($event)"
        />
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SignatureExample {
  readonly themePreference = createThemePreferenceSignal();
  readonly theme = createThemeConfig(this.themePreference);
  readonly registry = signal<PluginRegistry | null>(null);
  readonly signatureApi = createPluginCapabilitySignal<SignaturePlugin>(this.registry, 'signature');
  readonly entryCount = signal(0);
  readonly storedCount = signal(readStoredCount());
  readonly autoSave = signal(true);
  readonly status = signal<string | null>(null);
  readonly viewerConfig = computed(() => ({
    theme: this.theme(),
    documentManager: {
      initialDocuments: [
        {
          url: DEMO_DOCUMENT_URL,
          documentId: 'signature-doc',
        },
      ],
    },
  }));

  constructor() {
    effect((onCleanup) => {
      const api = this.signatureApi();
      if (!api) {
        this.entryCount.set(0);
        return;
      }

      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        try {
          const entries = deserializeEntries(JSON.parse(raw));
          api.loadEntries(entries);
          this.status.set(
            `Loaded ${entries.length} signature${entries.length !== 1 ? 's' : ''} from storage`,
          );
        } catch {
          this.status.set('Failed to load saved signatures');
        }
      }

      this.entryCount.set(api.getEntries().length);
      const cleanup = api.onEntriesChange((entries) => {
        this.entryCount.set(entries.length);
      });
      onCleanup(cleanup);
    });

    effect((onCleanup) => {
      const api = this.signatureApi();
      const enabled = this.autoSave();
      if (!api || !enabled || typeof localStorage === 'undefined') return;

      const cleanup = api.onEntriesChange((entries) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeEntries(entries)));
        this.storedCount.set(entries.length);
        this.status.set(
          `Auto-saved ${entries.length} signature${entries.length !== 1 ? 's' : ''}`,
        );
      });
      onCleanup(cleanup);
    });
  }

  onReady(registry: PluginRegistry) {
    this.registry.set(registry);
  }

  save() {
    const api = this.signatureApi();
    if (!api) return;
    const entries = api.exportEntries();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeEntries(entries)));
    this.storedCount.set(entries.length);
    this.status.set(`Saved ${entries.length} signature${entries.length !== 1 ? 's' : ''}`);
  }

  load() {
    const api = this.signatureApi();
    if (!api) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      this.status.set('No saved signatures found');
      return;
    }
    try {
      const entries = deserializeEntries(JSON.parse(raw));
      api.loadEntries(entries);
      this.status.set(`Loaded ${entries.length} signature${entries.length !== 1 ? 's' : ''}`);
    } catch {
      this.status.set('Failed to load signatures');
    }
  }

  clearStorage() {
    localStorage.removeItem(STORAGE_KEY);
    this.storedCount.set(0);
    this.status.set('Storage cleared');
  }
}
