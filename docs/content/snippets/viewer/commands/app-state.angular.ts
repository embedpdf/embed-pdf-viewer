import { Component, computed, signal } from '@angular/core';
import { EpdfPdfViewer, type ViewerConfig } from '@embedpdf/viewer-angular';

const CHECKS = ['Parties', 'Dates', 'Payment', 'Signatures'];

interface Review {
  done: string[];
  status: 'review' | 'approved';
  approve(): void;
}

@Component({
  selector: 'app-review',
  imports: [EpdfPdfViewer],
  template: `
    <fieldset>
      @for (check of checks; track check) {
        <label>
          <input type="checkbox" [checked]="done().includes(check)" (change)="toggle(check)" />
          {{ check }}
        </label>
      }
    </fieldset>
    <epdf-pdf-viewer
      src="https://www.embedpdf.com/pdfs/welcome.pdf"
      [config]="config"
      [appState]="appState()"
      style="height: 100vh"
    />
  `,
})
export class ReviewApp {
  readonly checks = CHECKS;
  readonly done = signal<string[]>([]);
  readonly status = signal<Review['status']>('review');
  readonly appState = computed<Review>(() => ({
    done: this.done(),
    status: this.status(),
    approve: () => this.status.set('approved'),
  }));

  toggle(check: string) {
    this.done.update((done) =>
      done.includes(check) ? done.filter((c) => c !== check) : [...done, check],
    );
  }

  // The commands read your state from `appState`, so nothing goes stale.
  readonly config: ViewerConfig<Review> = {
    commands: [
      {
        id: 'acme:approve',
        label: 'Approve',
        icon: 'check',
        enabled: ({ appState }) => appState.done.length === CHECKS.length,
        active: ({ appState }) => appState.status === 'approved',
        run: ({ appState }) => appState.approve(),
      },
    ],
    layout: (layout) => layout.add('acme:approve', { to: 'main', section: 'end' }),
  };
}
