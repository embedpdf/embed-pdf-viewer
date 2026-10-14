/**
 * The interaction service: the tools as signals and calls, `toolChanged$`, and
 * `overrideCursor()`, which gives a tool cursors of its own for as long as its caller lives and
 * follows the signals it reads.
 */
import { Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { EpdfKernelHost, provideEmbedPdf } from '@embedpdf/angular/runtime';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { bytesInput, fakeEngine, kernelOf, mount, viewerHost } from './fixtures';

afterEach(() => TestBed.resetTestingModule());

describe('EpdfInteraction', () => {
  it('has the active tool as a signal, the calls to switch, and toolChanged$', async () => {
    const fixture = await mount(viewerHost({ template: '', features: [withInteraction()] }));
    const interaction = fixture.debugElement.injector.get(EpdfInteraction);
    expect(interaction.activeToolId()).toBeNull();
    expect(interaction.tools()).toEqual([]);

    const changes: string[] = [];
    interaction.toolChanged$.subscribe(({ toolId }) => changes.push(toolId));
    await kernelOf(fixture).documents.open(bytesInput('a'));
    expect(interaction.activeToolId()).toBe('pointer');

    interaction.activateTool('pan');
    expect(interaction.activeToolId()).toBe('pan');
    interaction.pushTool('pointer');
    interaction.popTool();
    expect(interaction.activeToolId()).toBe('pan');
    expect(changes[0]).toBe('pan');
  });

  it('overrideCursor() sets a tool’s cursors while its caller lives, following its signals', async () => {
    const color = signal('red');
    @Component({ selector: 'test-pen-cursor', template: '' })
    class PenCursor {
      constructor() {
        inject(EpdfInteraction).overrideCursor(() => ({
          toolId: 'pan',
          cursors: { grab: `url(pen-${color()}.svg) 2 22, grab` },
        }));
      }
    }
    @Component({
      selector: 'test-host',
      imports: [PenCursor],
      providers: [provideEmbedPdf({ engine: fakeEngine().engine }, withInteraction())],
      template: '@if (shown()) { <test-pen-cursor /> }',
    })
    class Host {
      readonly viewer = inject(EpdfKernelHost);
      readonly shown = signal(true);
    }
    const fixture = await mount(Host);
    const host = fixture.componentInstance;
    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));
    const interaction = kernel.capability(InteractionToken);
    const setToolCursor = vi.spyOn(interaction, 'setToolCursor');
    host.shown.set(false);
    await fixture.whenStable();
    host.shown.set(true);
    await fixture.whenStable();
    expect(fixture.debugElement.query(By.directive(PenCursor))).not.toBeNull();
    expect(setToolCursor.mock.calls.at(-1)).toEqual([
      'pan',
      { grab: 'url(pen-red.svg) 2 22, grab' },
    ]);

    color.set('blue');
    await fixture.whenStable();
    expect(setToolCursor.mock.calls.slice(-2)).toEqual([
      ['pan', null],
      ['pan', { grab: 'url(pen-blue.svg) 2 22, grab' }],
    ]);

    host.shown.set(false);
    await fixture.whenStable();
    // The tool has its own cursors back.
    expect(setToolCursor.mock.calls.at(-1)).toEqual(['pan', null]);
  });
});
