/**
 * The shell binding: `shell.surface(id)` reads as closed with verbs that do nothing until a
 * document is open, then follows the panel; `epdfPanelToggle` toggles it with its group and
 * says so in `aria-expanded`; the State values and events. The i18n binding: the language as
 * signals with no document, and the `epdfT` pipe following a switch.
 */
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { EpdfPanelToggle, EpdfShell, withShell } from '@embedpdf/angular/shell';
import { EpdfI18n, EpdfTPipe, withI18n, type Locale } from '@embedpdf/angular/i18n';
import { bytesInput, kernelOf, mount, viewerHost } from './fixtures';

afterEach(() => TestBed.resetTestingModule());

describe('EpdfShell', () => {
  it('surface() reads as closed, and does nothing, until a document is open', async () => {
    const fixture = await mount(viewerHost({ template: '', features: [withShell()] }));
    const shell = fixture.debugElement.injector.get(EpdfShell);
    const panel = shell.surface('comments');
    expect(panel.isOpen()).toBe(false);
    expect(panel.props()).toEqual({});
    panel.open();
    expect(shell.openSurfaces()).toEqual([]);

    await kernelOf(fixture).documents.open(bytesInput('a'));
    panel.open({ props: { focus: 3 } });
    expect(panel.isOpen()).toBe(true);
    expect(panel.props()).toEqual({ focus: 3 });
    expect(shell.openSurfaces().map((surface) => surface.id)).toEqual(['comments']);
    panel.toggle();
    expect(panel.isOpen()).toBe(false);
  });

  it('surface() follows an id that changes, and props change without reopening', async () => {
    const fixture = await mount(viewerHost({ template: '', features: [withShell()] }));
    const shell = fixture.debugElement.injector.get(EpdfShell);
    await kernelOf(fixture).documents.open(bytesInput('a'));
    const id = signal('left');
    const panel = shell.surface(id);
    shell.open('right', { props: { index: 1 } });
    expect(panel.isOpen()).toBe(false);

    id.set('right');
    expect(panel.isOpen()).toBe(true);
    expect(panel.props()).toEqual({ index: 1 });
    shell.updateSurfaceProps('right', { index: 2 });
    expect(panel.props()).toEqual({ index: 2 });
    expect(panel.isOpen()).toBe(true);
  });

  it('has the open menus as a signal and the events as streams', async () => {
    const fixture = await mount(viewerHost({ template: '', features: [withShell()] }));
    const shell = fixture.debugElement.injector.get(EpdfShell);
    const opened: string[] = [];
    shell.surfaceOpened$.subscribe(({ id }) => opened.push(id));
    await kernelOf(fixture).documents.open(bytesInput('a'));

    shell.openMenu('view');
    shell.openMenu('view-tool');
    expect(shell.openMenus()).toEqual(['view', 'view-tool']);
    shell.closeAllMenus();
    expect(shell.openMenus()).toEqual([]);
    shell.open('thumbnails', { exclusive: 'left' });
    expect(opened).toEqual(['thumbnails']);
  });

  it('epdfPanelToggle toggles its panel in its group, and sets aria-expanded', async () => {
    const fixture = await mount(
      viewerHost({
        imports: [EpdfPanelToggle],
        features: [withShell()],
        template: `
          <button id="thumbnails" epdfPanelToggle="thumbnails" epdfPanelToggleExclusive="left"></button>
          <button id="outline" epdfPanelToggle="outline" epdfPanelToggleExclusive="left"
            #outline="epdfPanelToggle">{{ outline.isOpen() }}</button>
        `,
      }),
    );
    const shell = fixture.debugElement.injector.get(EpdfShell);
    await kernelOf(fixture).documents.open(bytesInput('a'));
    await fixture.whenStable();
    const thumbnails = fixture.nativeElement.querySelector('#thumbnails') as HTMLButtonElement;
    const outline = fixture.nativeElement.querySelector('#outline') as HTMLButtonElement;
    expect(thumbnails.getAttribute('aria-expanded')).toBe('false');

    thumbnails.click();
    await fixture.whenStable();
    expect(thumbnails.getAttribute('aria-expanded')).toBe('true');
    outline.click(); // the same group: the thumbnails close
    await fixture.whenStable();
    expect(shell.isOpen('thumbnails')).toBe(false);
    expect(outline.getAttribute('aria-expanded')).toBe('true');
    expect(outline.textContent).toBe('true');
  });
});

@Component({
  selector: 'test-language',
  imports: [EpdfTPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ 'commands.zoom.in' | epdfT }}|{{ 'app.pages' | epdfT: { params: { count: 2 } } }}`,
})
class Language {
  readonly i18n = inject(EpdfI18n);
}

describe('EpdfI18n', () => {
  const locales: Locale[] = [
    {
      code: 'en',
      name: 'English',
      translations: { app: { pages: { one: '{count} page', other: '{count} pages' } } },
    },
    { code: 'ar', name: 'العربية', direction: 'rtl', translations: {} },
    {
      code: 'nl',
      name: 'Nederlands',
      translations: { app: { pages: { one: '{count} pagina', other: "{count} pagina's" } } },
    },
  ];

  it('reads the language with no document, and the pipe follows a switch', async () => {
    const fixture = await mount(
      viewerHost({
        imports: [Language],
        features: [withI18n({ locales })],
        template: '<test-language />',
      }),
    );
    const i18n = fixture.debugElement.injector.get(EpdfI18n);
    await fixture.whenStable();
    expect([i18n.locale(), i18n.direction(), i18n.loading()]).toEqual(['en', 'ltr', null]);
    expect(i18n.locales().map((locale) => locale.code)).toEqual(['en', 'ar', 'nl']);
    const text = () => (fixture.nativeElement as HTMLElement).textContent;
    expect(text()).toBe('Zoom in|2 pages');

    await i18n.setLocale('nl');
    await fixture.whenStable();
    expect(text()).toBe("Inzoomen|2 pagina's");
    await i18n.setLocale('ar');
    expect([i18n.locale(), i18n.direction()]).toEqual(['ar', 'rtl']);
  });

  it('has a translator signal that changes with the language only', async () => {
    const fixture = await mount(viewerHost({ template: '', features: [withI18n({ locales })] }));
    const i18n = fixture.debugElement.injector.get(EpdfI18n);
    const first = i18n.translator();
    await kernelOf(fixture).documents.open(bytesInput('a'));
    expect(i18n.translator()).toBe(first);
    const changes: string[] = [];
    i18n.localeChanged$.subscribe(({ locale }) => changes.push(locale));
    await i18n.setLocale('nl');
    expect(i18n.translator()).not.toBe(first);
    expect(i18n.translator()('app.pages', { params: { count: 1 } })).toBe('1 pagina');
    expect(changes).toEqual(['nl']);
  });
});
