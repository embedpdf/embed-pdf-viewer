/**
 * The commands binding: `[epdfCommand]` runs a command on click and keeps the button's
 * `disabled`, `aria-pressed`, `title` and `hidden` in step, with the rest as signals on its
 * template reference; `commandOf()` changes only when what the command shows does; the keys,
 * app-wide (`withCommandShortcuts()`) or inside one element (`epdfCommandShortcuts`); and the
 * events as streams.
 */
import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EpdfCommand,
  EpdfCommands,
  EpdfCommandShortcuts,
  formatShortcut,
  withCommands,
  withCommandShortcuts,
} from '@embedpdf/angular/commands';
import type { CommandDef } from '@embedpdf/angular/commands';
import { EpdfDocumentScope } from '@embedpdf/angular/runtime';
import { bytesInput, kernelOf, mount, viewerHost } from './fixtures';

afterEach(() => TestBed.resetTestingModule());

const press = (key: string, target: EventTarget = window, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));

/** A command that can be switched on and off, and pressed, from the test. */
function toggleable(run = vi.fn()) {
  const state = { enabled: true, active: false };
  const command: CommandDef = {
    id: 'review:approve',
    label: 'Approve',
    icon: 'check',
    shortcut: 'Mod+Enter',
    enabled: () => state.enabled,
    active: () => state.active,
    run,
  };
  return { command, state, run };
}

describe('[epdfCommand]', () => {
  it('runs the command for its document, and shows its label, icon and shortcut', async () => {
    const { command, run } = toggleable();
    const fixture = await mount(
      viewerHost({
        imports: [EpdfCommand],
        features: [withCommands({ commands: [command] })],
        template: `
          <button [epdfCommand]="'review:approve'" #approve="epdfCommand">
            {{ approve.label() }}|{{ approve.icon() }}|{{ approve.shortcut() }}
          </button>
        `,
      }),
    );
    await kernelOf(fixture).documents.open(bytesInput('a'));
    await fixture.whenStable();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe(`Approve|check|${formatShortcut('Mod+Enter')}`);
    expect(button.title).toBe('Approve');
    expect(button.disabled).toBe(false);
    expect(button.hidden).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBeNull();

    button.click();
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'a' }));
  });

  it('follows the command: disabled, pressed, and hidden when it is unknown', async () => {
    const { command, state } = toggleable();
    const fixture = await mount(
      viewerHost({
        imports: [EpdfCommand],
        features: [withCommands({ commands: [command] })],
        template: `
          <button id="known" [epdfCommand]="'review:approve'"></button>
          <button id="unknown" [epdfCommand]="'nope'" #unknown="epdfCommand">{{ unknown.label() }}</button>
        `,
      }),
    );
    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));
    await fixture.whenStable();
    const known = fixture.nativeElement.querySelector('#known') as HTMLButtonElement;
    const unknown = fixture.nativeElement.querySelector('#unknown') as HTMLButtonElement;
    expect(unknown.hidden).toBe(true);
    expect(unknown.disabled).toBe(true);
    expect(unknown.textContent).toBe('');

    state.enabled = false;
    state.active = true;
    // A command's state is read from live state: any change of the viewer reads it again.
    await kernel.documents.open(bytesInput('b'));
    await fixture.whenStable();
    expect(known.disabled).toBe(true);
    expect(known.getAttribute('aria-pressed')).toBe('true');
  });

  it('acts on the document [epdfDocumentScope] names', async () => {
    const { command, run } = toggleable();
    const fixture = await mount(
      viewerHost({
        imports: [EpdfCommand, EpdfDocumentScope],
        features: [withCommands({ commands: [command] })],
        template: `
          <div [epdfDocumentScope]="'a'"><button [epdfCommand]="'review:approve'"></button></div>
        `,
      }),
    );
    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'));
    kernel.documents.setActive('b');
    await fixture.whenStable();

    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'a' }));
  });
});

describe('EpdfCommands', () => {
  it('commandOf() changes only when what the command shows changes', async () => {
    const { command, state } = toggleable();
    const fixture = await mount(
      viewerHost({ template: '', features: [withCommands({ commands: [command] })] }),
    );
    const commands = fixture.debugElement.injector.get(EpdfCommands);
    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));

    let reads = 0;
    const approve = commands.commandOf('review:approve');
    const label = computed(() => (reads++, approve()?.label));
    expect(label()).toBe('Approve');
    await kernel.documents.open(bytesInput('b')); // the viewer changed, the command didn't
    label();
    expect(reads).toBe(1);

    state.enabled = false;
    await kernel.documents.open(bytesInput('c'));
    expect(approve()?.enabled).toBe(false);
    expect(commands.commandOf('nope')()).toBeNull();
  });

  it('has the events as streams, and the settings', async () => {
    const { command } = toggleable();
    const fixture = await mount(
      viewerHost({ template: '', features: [withCommands({ commands: [command] })] }),
    );
    const commands = fixture.debugElement.injector.get(EpdfCommands);
    expect(commands.settings().disabledCategories).toEqual([]);
    const executed: string[] = [];
    commands.executed$.subscribe(({ commandId }) => executed.push(commandId));
    await kernelOf(fixture).documents.open(bytesInput('a'));

    await commands.execute('review:approve');
    expect(executed).toEqual(['review:approve']);
    commands.disableCategory('review');
    expect(commands.settings().disabledCategories).toEqual(['review']);
  });
});

describe('keyboard shortcuts', () => {
  it('withCommandShortcuts() turns every shortcut into a key, anywhere on the page', async () => {
    const { command, run } = toggleable();
    const fixture = await mount(
      viewerHost({
        template: '<input id="field" />',
        features: [withCommands({ commands: [command] }), withCommandShortcuts({ isMac: false })],
      }),
    );
    await kernelOf(fixture).documents.open(bytesInput('a'));
    await fixture.whenStable();

    // Keys typed into a text field are left alone.
    press('Enter', fixture.nativeElement.querySelector('#field'), { ctrlKey: true });
    expect(run).not.toHaveBeenCalled();
    press('Enter', window, { ctrlKey: true });
    expect(run).toHaveBeenCalledTimes(1);

    // The keys go with the viewer.
    fixture.destroy();
    press('Enter', window, { ctrlKey: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('epdfCommandShortcuts works only while focus is inside its element', async () => {
    const { command, run } = toggleable();
    const fixture = await mount(
      viewerHost({
        imports: [EpdfCommandShortcuts],
        features: [withCommands({ commands: [command] })],
        template: `
          <div id="viewer" tabindex="0" epdfCommandShortcuts><span id="inside"></span></div>
          <span id="outside"></span>
        `,
      }),
    );
    await kernelOf(fixture).documents.open(bytesInput('a'));
    await fixture.whenStable();
    const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
    const mod = isMac ? { metaKey: true } : { ctrlKey: true };

    press('Enter', fixture.nativeElement.querySelector('#outside'), mod);
    expect(run).not.toHaveBeenCalled();
    press('Enter', fixture.nativeElement.querySelector('#inside'), mod);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('withCommands() names its feature when a component needs the plugin', async () => {
    const fixture = mount(
      viewerHost({ imports: [EpdfCommand], template: `<button [epdfCommand]="'x'"></button>` }),
    );
    await expect(fixture).rejects.toThrow(/EPDF-102.*withCommands\(\)/);
  });
});
