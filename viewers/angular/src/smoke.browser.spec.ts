import { TestBed } from '@angular/core/testing';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { describe, expect, it } from 'vitest';

@Component({
  selector: 'embedpdf-browser-smoke',
  template: `<span data-testid="hello">Hello {{ name() }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class BrowserSmoke {
  readonly name = signal('Browser');
}

describe('Angular browser-mode smoke', () => {
  it('mounts a standalone component in real chromium', () => {
    TestBed.configureTestingModule({ imports: [BrowserSmoke] });
    const fixture = TestBed.createComponent(BrowserSmoke);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const span = host.querySelector('[data-testid="hello"]');
    expect(span?.textContent).toContain('Hello');
  });
});
