/**
 * `epdfTheme()`: setting names as CSS variables, which Angular's `[style]` binding sets on the
 * element as they are, and changes when the theme does.
 */
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { epdfTheme } from '@embedpdf/angular/runtime';
import { mount } from './fixtures';

afterEach(() => TestBed.resetTestingModule());

@Component({
  selector: 'test-themed',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="pdf-viewer" [style]="theme()"></div>`,
})
class Themed {
  readonly accent = signal('#e91e63');
  protected readonly theme = computed(() => epdfTheme({ accent: this.accent() }));
}

describe('epdfTheme', () => {
  it('is the theme as CSS variables', () => {
    expect(epdfTheme({ accent: '#e91e63', page: { shadow: 'none' } })).toEqual({
      '--epdf-accent': '#e91e63',
      '--epdf-page-shadow': 'none',
    });
  });

  it('sets the variables through [style], and follows the theme', async () => {
    const fixture = await mount(Themed);
    const viewer = fixture.nativeElement.querySelector('.pdf-viewer') as HTMLElement;
    expect(viewer.style.getPropertyValue('--epdf-accent')).toBe('#e91e63');

    fixture.componentInstance.accent.set('#0f6e56');
    await fixture.whenStable();
    expect(viewer.style.getPropertyValue('--epdf-accent')).toBe('#0f6e56');
  });
});
