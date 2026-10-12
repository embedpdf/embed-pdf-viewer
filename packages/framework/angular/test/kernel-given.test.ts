/**
 * `provideEmbedPdf({ kernel })`: a kernel someone else made, given to an injector. Its services
 * read and drive that kernel, settings included; the injector neither starts nor destroys it;
 * the kernel's plugins are what it has, whatever the features say; and an injector of its own,
 * as the full viewer's wrapper gives the templates it shows, scopes it to those templates.
 */
import {
  Component,
  inject,
  Injector,
  provideZonelessChangeDetection,
  runInInjectionContext,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKernel, type Kernel } from '@embedpdf/core';
import {
  EpdfDocuments,
  EpdfKernelHost,
  EpdfViewer,
  provideEmbedPdf,
} from '@embedpdf/angular/runtime';
import {
  bytesInput,
  counterPlugin,
  CounterToken,
  EpdfCounter,
  fakeEngine,
  mount,
  withCounter,
} from './fixtures';

afterEach(() => TestBed.resetTestingModule());

const text = (element: HTMLElement) => element.textContent?.replace(/\s+/g, ' ').trim();

/** A kernel made and started outside Angular, with the counter plugin, and one document open. */
async function startedKernel(): Promise<{ kernel: Kernel; destroyedCount: () => number }> {
  const { engine, destroyedCount } = fakeEngine();
  const kernel = createKernel({ engine, plugins: [counterPlugin] });
  await kernel.start();
  await kernel.documents.open(bytesInput('a'));
  return { kernel, destroyedCount };
}

describe('provideEmbedPdf({ kernel })', () => {
  it('gives the services that kernel: its documents, its plugins and their settings', async () => {
    const { kernel } = await startedKernel();
    @Component({
      selector: 'test-given',
      providers: [provideEmbedPdf({ kernel }, withCounter())],
      template: `{{ viewer.status() }}: {{ documents.activeId() }}, {{ counter.count() }}, step
        {{ counter.settings().step }}`,
    })
    class Given {
      readonly host = inject(EpdfKernelHost);
      protected readonly viewer = inject(EpdfViewer);
      protected readonly documents = inject(EpdfDocuments);
      readonly counter = inject(EpdfCounter);
    }
    const fixture = await mount(Given);
    expect(fixture.componentInstance.host.kernel()).toBe(kernel);
    expect(text(fixture.nativeElement)).toBe('ready: a, 0, step 1');

    fixture.componentInstance.counter.increment();
    fixture.componentInstance.counter.updateSettings({ step: 3 });
    await fixture.whenStable();
    expect(text(fixture.nativeElement)).toBe('ready: a, 1, step 3');
    // The service drove the kernel itself.
    expect(kernel.settingsOf(CounterToken).getSettings().step).toBe(3);
  });

  it('neither starts nor destroys it, nor the engine under it', async () => {
    const { engine, destroyedCount } = fakeEngine();
    const waiting = createKernel({ engine, plugins: [counterPlugin] });
    @Component({
      selector: 'test-given',
      providers: [provideEmbedPdf({ kernel: waiting })],
      template: '{{ viewer.status() }}',
    })
    class Given {
      protected readonly viewer = inject(EpdfViewer);
    }
    const fixture = await mount(Given);
    // Its maker hasn't started it yet: the injector waits, and says so.
    expect(waiting.status()).toBe('created');
    expect(text(fixture.nativeElement)).toBe('starting');

    await waiting.start();
    await waiting.documents.open(bytesInput('a'));
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(text(fixture.nativeElement)).toBe('ready');
    });

    fixture.destroy();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(waiting.status()).toBe('started');
    expect(destroyedCount()).toBe(0);
  });

  it("has the kernel's plugins: a feature's plugin the kernel doesn't have isn't there", async () => {
    const { engine } = fakeEngine();
    const bare = createKernel({ engine, plugins: [] });
    await bare.start();
    @Component({
      selector: 'test-given',
      providers: [provideEmbedPdf({ kernel: bare }, withCounter())],
      template: '',
    })
    class Given {
      readonly host = inject(EpdfKernelHost);
    }
    const fixture = await mount(Given);
    expect(fixture.componentInstance.host.plugins).toEqual([]);
    expect(fixture.componentInstance.host.provides(CounterToken)).toBe(false);
    expect(() =>
      runInInjectionContext(fixture.debugElement.injector, () => inject(EpdfCounter)),
    ).toThrow(/EPDF-102/);
  });

  it('scopes it to an injector of its own, which templates shown with it read', async () => {
    const { kernel } = await startedKernel();
    @Component({ selector: 'test-count', template: '{{ counter.count() }}' })
    class Count {
      protected readonly counter = inject(EpdfCounter);
    }
    @Component({
      selector: 'test-outlet',
      imports: [NgTemplateOutlet, Count],
      template: `
        <ng-template #inside><test-count /></ng-template>
        <ng-container *ngTemplateOutlet="inside; injector: viewerInjector" />
      `,
    })
    class Outlet {
      // What the full viewer's wrapper does: one injector for its kernel, under the app's.
      readonly viewerInjector = Injector.create({
        providers: [provideEmbedPdf({ kernel }, withCounter())],
        parent: inject(Injector),
      });
    }
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Outlet);
    await fixture.whenStable();
    expect(text(fixture.nativeElement)).toBe('0');

    kernel.capability(CounterToken, 'a').increment();
    await fixture.whenStable();
    expect(text(fixture.nativeElement)).toBe('1');

    // Destroying that injector lets the kernel go on.
    fixture.componentInstance.viewerInjector.destroy();
    fixture.destroy();
    expect(kernel.status()).toBe('started');
  });
});
