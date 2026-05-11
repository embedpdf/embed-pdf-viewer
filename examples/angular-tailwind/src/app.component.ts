import { ChangeDetectionStrategy, Component, effect, signal } from '@angular/core';

import DocumentManagerExample from './examples/viewer/document-manager-example';
import EngineExample from './examples/viewer/engine-example';
import ThemeExample from './examples/viewer/theme-example';
import UiCustomizationExample from './examples/viewer/ui-customization-example';
import ViewerExample from './examples/viewer/viewer-example';
import ZoomExample from './examples/viewer/zoom-example';

const DEMOS = [
  { id: 'viewer', label: 'Viewer', component: ViewerExample },
  { id: 'theme', label: 'Theme', component: ThemeExample },
  { id: 'ui-customization', label: 'UI Customization', component: UiCustomizationExample },
  { id: 'engine', label: 'Engine', component: EngineExample },
  { id: 'zoom', label: 'Zoom', component: ZoomExample },
  { id: 'document-manager', label: 'Document Manager', component: DocumentManagerExample },
] as const;

type DemoId = (typeof DEMOS)[number]['id'];

@Component({
  selector: 'app-root',
  imports: [
    ViewerExample,
    ThemeExample,
    UiCustomizationExample,
    EngineExample,
    ZoomExample,
    DocumentManagerExample,
  ],
  template: `
    <main class="min-h-screen bg-slate-950 text-slate-100">
      <div class="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header
          class="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur"
        >
          <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div class="space-y-2">
              <p class="text-sm font-semibold uppercase tracking-[0.2em] text-teal-300">
                Angular + Tailwind examples
              </p>
              <h1 class="text-3xl font-semibold text-white">Live EmbedPDF Angular demos</h1>
              <p class="max-w-3xl text-sm text-slate-300 sm:text-base">
                This workspace mirrors the docs examples that the React-rendered website can mount
                inline with the Angular wrapper.
              </p>
            </div>
            <button
              type="button"
              class="inline-flex items-center justify-center rounded-full border border-white/10 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-teal-400/50 hover:bg-slate-700"
              (click)="toggleTheme()"
            >
              {{ isDark() ? 'Switch to light mode' : 'Switch to dark mode' }}
            </button>
          </div>

          <nav class="flex flex-wrap gap-2">
            @for (demo of demos; track demo.id) {
              <button
                type="button"
                class="rounded-full px-4 py-2 text-sm font-medium transition"
                [class.bg-teal-400]="activeDemo() === demo.id"
                [class.text-slate-950]="activeDemo() === demo.id"
                [class.bg-slate-800]="activeDemo() !== demo.id"
                [class.text-slate-200]="activeDemo() !== demo.id"
                [class.hover:bg-slate-700]="activeDemo() !== demo.id"
                (click)="activeDemo.set(demo.id)"
              >
                {{ demo.label }}
              </button>
            }
          </nav>
        </header>

        <section
          class="rounded-3xl border border-white/10 bg-slate-900/70 p-3 shadow-2xl shadow-slate-950/30 backdrop-blur sm:p-4"
        >
          @switch (activeDemo()) {
            @case ('viewer') {
              <viewer-example />
            }
            @case ('theme') {
              <theme-example />
            }
            @case ('ui-customization') {
              <ui-customization-example />
            }
            @case ('engine') {
              <engine-example />
            }
            @case ('zoom') {
              <zoom-example />
            }
            @case ('document-manager') {
              <document-manager-example />
            }
          }
        </section>
      </div>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class App {
  readonly demos = DEMOS;
  readonly activeDemo = signal<DemoId>('viewer');
  readonly isDark = signal(true);

  constructor() {
    effect(() => {
      if (typeof document === 'undefined') return;
      document.documentElement.classList.toggle('dark', this.isDark());
    });
  }

  toggleTheme() {
    this.isDark.update((value) => !value);
  }
}
