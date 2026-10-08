/**
 * `<epdf-toolbar>`: the app's templates draw each visible command at the variant the fit gave
 * it, with separators between groups; the hidden layer draws every variant to measure it; a
 * group folds when it doesn't fit; what still doesn't fit goes into the "More" menu, which runs
 * a row's command and closes; an item of your own gets its template with its variant, or a
 * `<slot>` without one.
 *
 * The widths are the test's: happy-dom lays nothing out, so `@embedpdf/web`'s observers report
 * a fixed width for every measured element and the width the test gives the toolbar.
 */
import { ChangeDetectionStrategy, Component, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withCommands } from '@embedpdf/angular/commands';
import type { CommandDef } from '@embedpdf/angular/commands';
import {
  custom,
  EpdfToolbar,
  EpdfToolbarCommandTemplate,
  EpdfToolbarCustomTemplate,
  group,
  item,
  type BarSchema,
} from '@embedpdf/angular/toolbar';
import { bytesInput, kernelOf, mount, viewerHost } from './fixtures';

const layout = vi.hoisted(() => ({
  /** Every measured element's width. */
  item: 60,
  /** Sets the width the toolbar has to fill. */
  setContainer: (_width: number) => {},
}));

vi.mock('@embedpdf/web', async (importOriginal) => {
  const web = await importOriginal<typeof import('@embedpdf/web')>();
  return {
    ...web,
    observeContentWidth: (_element: HTMLElement, onWidth: (width: number) => void) => {
      layout.setContainer = onWidth;
      onWidth(1000);
      return () => {};
    },
    observeWidth: (_element: Element, onWidth: (width: number) => void) => {
      onWidth(layout.item);
      return () => {};
    },
  };
});

afterEach(() => TestBed.resetTestingModule());

const ran: string[] = [];
const command = (id: string, extra: Partial<CommandDef> = {}): CommandDef => ({
  id: `test:${id}`,
  label: id.toUpperCase(),
  run: () => void ran.push(id),
  ...extra,
});
const COMMANDS = [
  command('previous'),
  command('next'),
  command('out'),
  command('in'),
  command('pointer'),
  command('hidden', { visible: () => false }),
];

const BAR: BarSchema = {
  id: 'main',
  sections: {
    start: [group('navigation', ['test:previous', 'test:next'])],
    center: [group('zoom', ['test:out', item('test:in', { variants: ['icon+label', 'icon'] })])],
    end: [group('tools', ['test:pointer', 'test:hidden'])],
  },
};

@Component({
  selector: 'test-toolbar',
  imports: [EpdfToolbar, EpdfToolbarCommandTemplate],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <epdf-toolbar [bar]="bar">
      <ng-template epdfToolbarCommand let-command let-variant="variant" let-run="run">
        <button [attr.data-command]="command.id" (click)="run()">
          {{ command.label }}@{{ variant }}
        </button>
      </ng-template>
    </epdf-toolbar>
  `,
})
class TestToolbar {
  readonly bar = BAR;
}

@Component({
  selector: 'test-default-toolbar',
  imports: [EpdfToolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<epdf-toolbar [bar]="bar" />`,
})
class DefaultToolbar {
  readonly bar = BAR;
}

@Component({
  selector: 'test-custom-toolbar',
  imports: [EpdfToolbar, EpdfToolbarCustomTemplate],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <epdf-toolbar [bar]="bar">
      <ng-template epdfToolbarCustom="page" let-variant let-layer="layer">
        <i class="page">{{ variant }}:{{ layer }}</i>
      </ng-template>
    </epdf-toolbar>
  `,
})
class CustomToolbar {
  readonly bar: BarSchema = {
    id: 'custom',
    sections: {
      center: [
        group('pages', [
          custom('page', 'test:next', { variants: ['full', 'compact'] }),
          custom('socket', 'test:previous'),
        ]),
      ],
    },
  };
}

@Component({
  selector: 'test-folding-toolbar',
  imports: [EpdfToolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<epdf-toolbar [bar]="bar" />`,
})
class FoldingToolbar {
  readonly bar: BarSchema = {
    id: 'folding',
    sections: {
      start: [
        group('tools', ['test:previous', 'test:next', 'test:out', 'test:in'], {
          collapse: 'select',
        }),
      ],
    },
  };
}

/** A viewer around one of the toolbars above, given as its class and its element. */
async function toolbarWith(component: Type<unknown>, element: string) {
  ran.length = 0;
  const fixture = await mount(
    viewerHost({
      imports: [component],
      features: [withCommands({ commands: COMMANDS })],
      template: `<${element} />`,
    }),
  );
  await kernelOf(fixture).documents.open(bytesInput('a'));
  await fixture.whenStable();
  const toolbar = fixture.nativeElement.querySelector('epdf-toolbar') as HTMLElement;
  /** What the live row shows, section by section. */
  const row = () =>
    [...toolbar.querySelectorAll(':scope > div:not([aria-hidden])')].map((section) =>
      [...section.children].map((child) => child.textContent?.trim() ?? ''),
    );
  const measured = () => toolbar.querySelector(':scope > div[aria-hidden]') as HTMLElement;
  return { fixture, toolbar, row, measured };
}

describe('<epdf-toolbar>', () => {
  it('draws each visible command with its variant, with separators between groups', async () => {
    const { toolbar, row, measured } = await toolbarWith(TestToolbar, 'test-toolbar');
    expect(row()).toEqual([
      ['PREVIOUS@icon', 'NEXT@icon'],
      ['OUT@icon', 'IN@icon+label'],
      ['POINTER@icon'],
    ]);
    // The hidden layer draws every variant, to measure it.
    expect(measured().textContent).toContain('IN@icon+label');
    expect(measured().textContent).toContain('IN@icon');
    expect(measured().textContent).not.toContain('HIDDEN');

    (toolbar.querySelector('[data-command="test:next"]') as HTMLButtonElement).click();
    expect(ran).toEqual(['next']);
  });

  it('puts what doesn’t fit into the "More" menu, which runs a row and closes', async () => {
    const { fixture, toolbar, row } = await toolbarWith(TestToolbar, 'test-toolbar');
    layout.setContainer(200);
    await fixture.whenStable();
    const shown = row().flat();
    expect(shown.length).toBeLessThan(5);

    const liveMore = () =>
      toolbar.querySelector(':scope > div:not([aria-hidden]) button[title="More"]');
    const more = liveMore() as HTMLButtonElement;
    expect(more).not.toBeNull();
    more.click();
    await fixture.whenStable();
    const rows = [
      ...toolbar.querySelectorAll('[role="menu"] [role="menuitem"]'),
    ] as HTMLButtonElement[];
    // Every command is either in the row or in the menu.
    expect(rows.length + shown.filter((text) => text.includes('@')).length).toBe(5);
    const [first] = rows;
    first.click();
    await fixture.whenStable();
    expect(ran).toHaveLength(1);
    expect(toolbar.querySelector('[role="menu"]')).toBeNull();

    // Everything fits again: no "More" button.
    layout.setContainer(1000);
    await fixture.whenStable();
    expect(liveMore()).toBeNull();
  });

  it('closes the "More" menu on a press outside it, not on one inside it or on its button', async () => {
    const { fixture, toolbar } = await toolbarWith(TestToolbar, 'test-toolbar');
    layout.setContainer(200);
    await fixture.whenStable();
    const more = toolbar.querySelector(
      ':scope > div:not([aria-hidden]) button[title="More"]',
    ) as HTMLButtonElement;
    more.click();
    await fixture.whenStable();
    const press = (target: EventTarget) =>
      target.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    press(toolbar.querySelector('[role="menu"] [role="menuitem"]')!);
    press(more);
    await fixture.whenStable();
    expect(toolbar.querySelector('[role="menu"]')).not.toBeNull();

    press(document.body);
    await fixture.whenStable();
    expect(toolbar.querySelector('[role="menu"]')).toBeNull();
  });

  it('draws a plain button for a command without a template', async () => {
    const { toolbar } = await toolbarWith(DefaultToolbar, 'test-default-toolbar');
    const buttons = [...toolbar.querySelectorAll(':scope > div:not([aria-hidden]) button')];
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'PREVIOUS',
      'NEXT',
      'OUT',
      'IN',
      'POINTER',
    ]);
    (buttons[0] as HTMLButtonElement).click();
    expect(ran).toEqual(['previous']);
  });

  it('gives an item of your own its template and variant, or a <slot> without one', async () => {
    const { toolbar, measured } = await toolbarWith(CustomToolbar, 'test-custom-toolbar');
    const live = toolbar.querySelector(':scope > div:not([aria-hidden]) .page');
    expect(live?.textContent).toBe('full:live');
    expect([...measured().querySelectorAll('.page')].map((page) => page.textContent)).toEqual([
      'full:measure',
      'compact:measure',
    ]);
    const slot = toolbar.querySelector('slot[name="socket"]');
    expect(slot?.textContent?.trim()).toBe('PREVIOUS');
    // Only one slot of a name: the measurement layer leaves it out.
    expect(measured().querySelector('slot')).toBeNull();
  });

  it('folds a group into its plain <select> when it doesn’t fit, which runs the one picked', async () => {
    const { fixture, toolbar, row } = await toolbarWith(FoldingToolbar, 'test-folding-toolbar');
    expect(row()).toEqual([['PREVIOUS', 'NEXT', 'OUT', 'IN'], [], []]);

    // Four items and their gaps need 272px; the folded group, 68.
    layout.setContainer(200);
    await fixture.whenStable();
    const select = toolbar.querySelector(
      ':scope > div:not([aria-hidden]) select',
    ) as HTMLSelectElement;
    expect(
      [...select.options].filter((option) => option.value).map((option) => option.text.trim()),
    ).toEqual(['PREVIOUS', 'NEXT', 'OUT', 'IN']);
    select.value = 'test:out';
    select.dispatchEvent(new Event('change'));
    expect(ran).toEqual(['out']);
  });
});
