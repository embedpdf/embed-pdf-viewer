import { ChangeDetectionStrategy, Component, effect, signal } from '@angular/core';

import DisableCategoriesExample from './examples/viewer/disable-categories-example';
import DocumentLoadingExample from './examples/viewer/document-loading-example';
import DocumentManagerExample from './examples/viewer/document-manager-example';
import EngineExample from './examples/viewer/engine-example';
import RotateExample from './examples/viewer/rotate-example';
import ScrollInitialPageExample from './examples/viewer/scroll-initial-page-example';
import SpreadExample from './examples/viewer/spread-example';
import ThemeExample from './examples/viewer/theme-example';
import UiCustomizationExample from './examples/viewer/ui-customization-example';
import ViewerExample from './examples/viewer/viewer-example';
import ZoomExample from './examples/viewer/zoom-example';

const DEMOS = [
  { id: 'viewer', label: 'Viewer' },
  { id: 'theme', label: 'Theme' },
  { id: 'ui-customization', label: 'UI Customization' },
  { id: 'engine', label: 'Engine' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'rotate', label: 'Rotate' },
  { id: 'spread', label: 'Spread' },
  { id: 'document-loading', label: 'Document Loading' },
  { id: 'scroll-initial-page', label: 'Scroll Initial Page' },
  { id: 'disable-categories', label: 'Disable Categories' },
  { id: 'document-manager', label: 'Document Manager' },
] as const;

type DemoId = (typeof DEMOS)[number]['id'];

@Component({
  selector: 'app-root',
  imports: [
    ViewerExample,
    ThemeExample,
    UiCustomizationExample,
    DisableCategoriesExample,
    DocumentLoadingExample,
    EngineExample,
    ZoomExample,
    RotateExample,
    ScrollInitialPageExample,
    SpreadExample,
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
              @defer (on immediate) {
                <theme-example />
              } @placeholder (minimum 150ms) {
                <div
                  class="flex min-h-[600px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-950/40 px-6 text-sm text-slate-400"
                >
                  Loading theme demo…
                </div>
              }
            }
            @case ('ui-customization') {
              @defer (on immediate) {
                <ui-customization-example />
              } @placeholder (minimum 150ms) {
                <div
                  class="flex min-h-[600px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-950/40 px-6 text-sm text-slate-400"
                >
                  Loading UI customization demo…
                </div>
              }
            }
            @case ('engine') {
              @defer (on immediate) {
                <engine-example />
              } @placeholder (minimum 150ms) {
                <div
                  class="flex min-h-[600px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-950/40 px-6 text-sm text-slate-400"
                >
                  Loading engine demo…
                </div>
              }
            }
            @case ('zoom') {
              @defer (on immediate) {
                <zoom-example />
              } @placeholder (minimum 150ms) {
                <div
                  class="flex min-h-[600px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-950/40 px-6 text-sm text-slate-400"
                >
                  Loading zoom demo…
                </div>
              }
            }
            @case ('rotate') {
              @defer (on immediate) {
                <rotate-example />
              } @placeholder (minimum 150ms) {
                <div
                  class="flex min-h-[600px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-950/40 px-6 text-sm text-slate-400"
                >
                  Loading rotate demo…
                </div>
              }
            }
            @case ('spread') {
              @defer (on immediate) {
                <spread-example />
              } @placeholder (minimum 150ms) {
                <div
                  class="flex min-h-[600px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-950/40 px-6 text-sm text-slate-400"
                >
                  Loading spread demo…
                </div>
              }
            }
            @case ('document-loading') {
              @defer (on immediate) {
                <document-loading-example />
              } @placeholder (minimum 150ms) {
                <div
                  class="flex min-h-[600px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-950/40 px-6 text-sm text-slate-400"
                >
                  Loading document loading demo…
                </div>
              }
            }
            @case ('scroll-initial-page') {
              @defer (on immediate) {
                <scroll-initial-page-example />
              } @placeholder (minimum 150ms) {
                <div
                  class="flex min-h-[600px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-950/40 px-6 text-sm text-slate-400"
                >
                  Loading initial page demo…
                </div>
              }
            }
            @case ('disable-categories') {
              @defer (on immediate) {
                <disable-categories-example />
              } @placeholder (minimum 150ms) {
                <div
                  class="flex min-h-[600px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-950/40 px-6 text-sm text-slate-400"
                >
                  Loading disable categories demo…
                </div>
              }
            }
            @case ('document-manager') {
              @defer (on immediate) {
                <document-manager-example />
              } @placeholder (minimum 150ms) {
                <div
                  class="flex min-h-[600px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-950/40 px-6 text-sm text-slate-400"
                >
                  Loading document manager demo…
                </div>
              }
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
