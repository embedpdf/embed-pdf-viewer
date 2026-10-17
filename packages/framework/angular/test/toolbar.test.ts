/**
 * `<epdf-toolbar>`: the app's templates draw each visible command at the variant the fit gave
 * it, with separators between groups; the hidden layer draws every variant to measure it; a
 * group folds when it doesn't fit; what still doesn't fit goes into the "More" menu, which runs
 * a row's command and closes; an item of your own gets its template with its variant, or a
 * `<slot>` without one. The toolbar is one tab stop with arrow keys, and its menus take the
 * menu keys.
 *
 * The lengths are the test's: happy-dom lays nothing out, so `@embedpdf/web`'s observers report
 * a fixed length for every measured element (a width across, a height down) and the room the
 * test gives the toolbar along the way it runs.
 */
import { ChangeDetectionStrategy, Component, input, type OnInit, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { bytesInput, CounterToken, kernelOf, mount, viewerHost, withCounter } from './fixtures';

type Way = 'horizontal' | 'vertical';

const layout = vi.hoisted(() => ({
  /** Every measured element's length: its width across, its height down. */
  item: { horizontal: 60, vertical: 20 } as Record<'horizontal' | 'vertical', number>,
  /** The room a toolbar starts with, along the way it runs. */
  room: { horizontal: 1000, vertical: 1000 } as Record<'horizontal' | 'vertical', number>,
  /** Sets the room the toolbar has to fill, along the way it runs now. */
  setContainer: (_length: number) => {},
  /** Every measured element's report, as a resize would send it again. */
  reports: new Set<() => void>(),
}));

vi.mock('@embedpdf/web', async (importOriginal) => {
  const web = await importOriginal<typeof import('@embedpdf/web')>();
  return {
    ...web,
    observeContentLength: (
      _element: HTMLElement,
      orientation: Way,
      onLength: (length: number) => void,
    ) => {
      layout.setContainer = onLength;
      onLength(layout.room[orientation]);
      return () => {};
    },
    observeLength: (_element: Element, orientation: Way, onLength: (length: number) => void) => {
      const report = () => onLength(layout.item[orientation]);
      layout.reports.add(report);
      report();
      return () => layout.reports.delete(report);
    },
  };
});

beforeEach(() => {
  layout.room = { horizontal: 1000, vertical: 1000 };
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
  command('off', { enabled: () => false }),
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

/** How many times the live copy of the item below was drawn. */
let wideDrawn = 0;

/** An item of your own that only its live copy can measure: it reports 500px itself. */
@Component({ selector: 'test-wide', template: '<span class="wide">Wide</span>' })
class Wide implements OnInit {
  readonly measure = input.required<(length: number) => void>();

  ngOnInit(): void {
    wideDrawn += 1;
    this.measure()(500);
  }
}

@Component({
  selector: 'test-measured-live-toolbar',
  imports: [EpdfToolbar, EpdfToolbarCommandTemplate, EpdfToolbarCustomTemplate, Wide],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <epdf-toolbar [bar]="bar">
      <ng-template epdfToolbarCommand let-command let-run="run">
        <button class="cmd" (click)="run()">{{ command.label }}</button>
      </ng-template>
      <ng-template epdfToolbarCustom="wide" let-layer="layer" let-measure="measure">
        @if (layer === 'live') {
          <test-wide [measure]="measure" />
        }
      </ng-template>
    </epdf-toolbar>
  `,
})
class MeasuredLiveToolbar {
  readonly bar: BarSchema = {
    id: 'measured-live',
    sections: { center: [group('g', ['test:out', custom('wide', 'test:next')])] },
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
      features: [withCommands({ commands: COMMANDS }), withCounter()],
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

  it('measures an item of your own that draws nothing in the measurement layer where it renders, by measure', async () => {
    layout.room = { horizontal: 200, vertical: 200 };
    wideDrawn = 0;
    const { fixture, toolbar, measured } = await toolbarWith(
      MeasuredLiveToolbar,
      'test-measured-live-toolbar',
    );
    // 500px don't fit in 200: the item goes into "More", as its command.
    const live = () => toolbar.querySelectorAll(':scope > div:not([aria-hidden]) .wide');
    expect(live()).toHaveLength(0);
    expect(wideDrawn).toBe(1);
    // The measurement layer draws nothing for it, so a resize there doesn't report it as the
    // 60px every other element measures, which would fit and draw it in the row again.
    expect(measured().querySelector('.wide')).toBeNull();
    for (const report of layout.reports) report();
    await fixture.whenStable();
    expect(wideDrawn).toBe(1);
    expect(live()).toHaveLength(0);
    const more = toolbar.querySelector(
      ':scope > div:not([aria-hidden]) button[title="More"]',
    ) as HTMLButtonElement;
    more.click();
    await fixture.whenStable();
    expect(
      [...toolbar.querySelectorAll('[role="menu"] [role="menuitem"]')].map((row) =>
        row.textContent?.trim(),
      ),
    ).toContain('NEXT');
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

/** A toolbar of `bar`, drawn by `template` (an `<epdf-toolbar>` with whatever a test gives it). */
function toolbarOf(bar: BarSchema, template: string): Type<unknown> {
  @Component({
    selector: 'test-keys-toolbar',
    imports: [EpdfToolbar, EpdfToolbarCommandTemplate, EpdfToolbarCustomTemplate],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template,
  })
  class KeysToolbar {
    readonly bar = bar;
  }
  return KeysToolbar;
}

const keysOf = (bar: BarSchema, template = `<epdf-toolbar [bar]="bar" />`) =>
  toolbarWith(toolbarOf(bar, template), 'test-keys-toolbar');

/** Press a key on what has focus. */
const press = (key: string) =>
  (document.activeElement as HTMLElement).dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  );

/** The live row's button with this text. */
const buttonIn = (toolbar: HTMLElement, label: string) =>
  [...toolbar.querySelectorAll<HTMLButtonElement>(':scope > div:not([aria-hidden]) button')].find(
    (button) => button.textContent?.trim() === label,
  )!;

const KEYS_BAR: BarSchema = {
  id: 'keys',
  sections: {
    start: [group('a', ['test:previous', 'test:off', 'test:next'])],
    end: [group('b', ['test:pointer'])],
  },
};

describe('<epdf-toolbar> keyboard and screen readers', () => {
  it('is a toolbar to a screen reader, with its orientation and name', async () => {
    const { toolbar } = await keysOf(KEYS_BAR, `<epdf-toolbar [bar]="bar" aria-label="Main" />`);
    expect(toolbar.getAttribute('role')).toBe('toolbar');
    expect(toolbar.getAttribute('aria-orientation')).toBe('horizontal');
    expect(toolbar.getAttribute('aria-label')).toBe('Main');
  });

  it('is one tab stop, with arrow keys, Home and End between its buttons, past a disabled one', async () => {
    const { toolbar } = await keysOf(KEYS_BAR);
    const button = (label: string) => buttonIn(toolbar, label);
    const stops = ['PREVIOUS', 'NEXT', 'POINTER'].map(button);
    expect(stops.map((stop) => stop.tabIndex)).toEqual([0, -1, -1]);

    stops[0]!.focus();
    press('ArrowRight');
    expect(document.activeElement).toBe(button('NEXT'));
    press('End');
    expect(document.activeElement).toBe(button('POINTER'));
    press('ArrowRight');
    expect(document.activeElement).toBe(button('PREVIOUS'));
    press('ArrowLeft');
    expect(document.activeElement).toBe(button('POINTER'));
    expect(stops.map((stop) => stop.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('swaps Left and Right in right-to-left text', async () => {
    const { toolbar } = await keysOf(
      KEYS_BAR,
      `<epdf-toolbar [bar]="bar" style="direction: rtl" />`,
    );
    buttonIn(toolbar, 'PREVIOUS').focus();
    press('ArrowLeft');
    expect(document.activeElement).toBe(buttonIn(toolbar, 'NEXT'));
    press('ArrowRight');
    expect(document.activeElement).toBe(buttonIn(toolbar, 'PREVIOUS'));
  });

  it('makes the first focusable element of an item of your own its stop, and leaves it its keys', async () => {
    const bar: BarSchema = {
      id: 'custom',
      sections: { center: [group('page', [custom('page', 'test:next'), 'test:pointer'])] },
    };
    const { toolbar } = await keysOf(
      bar,
      `<epdf-toolbar [bar]="bar">
        <ng-template epdfToolbarCustom="page">
          <span><input aria-label="Page" /><button type="button">Go</button></span>
        </ng-template>
      </epdf-toolbar>`,
    );
    const input = toolbar.querySelector(':scope > div:not([aria-hidden]) input') as HTMLElement;
    buttonIn(toolbar, 'POINTER').focus();
    press('ArrowLeft');
    expect(document.activeElement).toBe(input);
    // The field keeps Left and Right for its caret.
    press('ArrowRight');
    expect(document.activeElement).toBe(input);
    // The item's other controls are the item's own.
    expect(buttonIn(toolbar, 'Go').tabIndex).toBe(0);
  });

  /** The toolbar of `BAR` with too little room: its "More" button, live. */
  async function withMore() {
    const drawn = await keysOf(BAR);
    layout.setContainer(200);
    await drawn.fixture.whenStable();
    const more = drawn.toolbar.querySelector(
      ':scope > div:not([aria-hidden]) button[title="More"]',
    ) as HTMLButtonElement;
    const rows = () => [
      ...drawn.toolbar.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]'),
    ];
    return { ...drawn, more, rows };
  }

  it('opens "More" on its first row, moves with the arrows, and Escape gives focus back', async () => {
    const { fixture, toolbar, more, rows } = await withMore();
    more.focus();
    more.click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(rows()[0]);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    press('ArrowDown');
    expect(document.activeElement).toBe(rows()[1]);

    press('Escape');
    await fixture.whenStable();
    expect(toolbar.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(more);
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps focus on the row it is on when the toolbar draws again', async () => {
    const { fixture, toolbar, more, rows } = await withMore();
    more.click();
    await fixture.whenStable();
    press('ArrowDown');
    const row = rows()[1];
    expect(document.activeElement).toBe(row);

    kernelOf(fixture).capability(CounterToken, 'a').touch();
    await fixture.whenStable();
    expect(toolbar.querySelector('[role="menu"]')).not.toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it('gives focus back to "More" when a row is picked', async () => {
    const { fixture, toolbar, more } = await withMore();
    more.click();
    await fixture.whenStable();
    press('Enter');
    await fixture.whenStable();
    expect(toolbar.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it('keeps the measured copies out of focus and away from screen readers', async () => {
    const { measured } = await keysOf(BAR);
    expect(measured().hasAttribute('inert')).toBe(true);
    expect(measured().querySelectorAll('button').length).toBeGreaterThan(0);
  });
});

describe('<epdf-toolbar orientation="vertical">', () => {
  const RAIL: BarSchema = {
    id: 'rail',
    sections: {
      start: [
        group('a', [item('test:previous', { variants: ['icon+label', 'icon'] }), 'test:next']),
      ],
      end: [group('b', ['test:pointer'])],
    },
  };
  const DRAWN_RAIL = `
    <epdf-toolbar [bar]="bar" orientation="vertical">
      <ng-template epdfToolbarCommand let-command let-variant="variant" let-run="run">
        <button [attr.data-command]="command.id" (click)="run()">
          {{ command.label }}@{{ variant }}
        </button>
      </ng-template>
    </epdf-toolbar>
  `;

  it('fits the height it has, whatever its width, and draws every command as its icon', async () => {
    // Too narrow for a single item across, but tall enough for every one.
    layout.room = { horizontal: 10, vertical: 1000 };
    const { toolbar, row } = await keysOf(RAIL, DRAWN_RAIL);
    expect(toolbar.getAttribute('aria-orientation')).toBe('vertical');
    expect(row()).toEqual([['PREVIOUS@icon', 'NEXT@icon'], [], ['POINTER@icon']]);
    expect(
      toolbar.querySelector(':scope > div:not([aria-hidden]) button[title="More"]'),
    ).toBeNull();
  });

  it('makes room when its height runs out', async () => {
    // Three 20px items, two 8px gaps and a separator take 85px.
    layout.room = { horizontal: 1000, vertical: 50 };
    const { toolbar } = await keysOf(RAIL, DRAWN_RAIL);
    const live = toolbar.querySelectorAll(':scope > div:not([aria-hidden]) [data-command]');
    expect(live.length).toBeLessThan(3);
    expect(
      toolbar.querySelector(':scope > div:not([aria-hidden]) button[title="More"]'),
    ).not.toBeNull();
  });

  it('moves with Up and Down, and leaves Left and Right alone', async () => {
    const { toolbar } = await keysOf(RAIL, `<epdf-toolbar [bar]="bar" orientation="vertical" />`);
    const button = (label: string) => buttonIn(toolbar, label);
    button('PREVIOUS').focus();
    press('ArrowRight');
    expect(document.activeElement).toBe(button('PREVIOUS'));
    press('ArrowDown');
    expect(document.activeElement).toBe(button('NEXT'));
    press('ArrowUp');
    expect(document.activeElement).toBe(button('PREVIOUS'));
  });

  it('opens its "More" menu beside the toolbar', async () => {
    layout.room = { horizontal: 1000, vertical: 0 };
    const { fixture, toolbar } = await keysOf(
      RAIL,
      `<epdf-toolbar [bar]="bar" orientation="vertical" />`,
    );
    (
      toolbar.querySelector(
        ':scope > div:not([aria-hidden]) button[title="More"]',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    const menu = toolbar.querySelector('[role="menu"]') as HTMLElement;
    expect(menu.style.insetInlineStart).toBe('100%');
    expect(menu.style.top).toBe('0px');
  });
});
