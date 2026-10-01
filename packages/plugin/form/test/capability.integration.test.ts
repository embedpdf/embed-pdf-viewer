import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createKernel } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import type { FormFieldDTO } from '@embedpdf/engine-core/runtime';
import { interactionPlugin } from '@embedpdf/plugin-interaction';

import { toFieldRef, type FormFieldCreatedEvent, type FormValueChangedEvent } from '../src/contract';
import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/host-contract';
import { formState } from '../src/state';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '..', '..', '..', 'engine', 'main', 'test', 'fixtures', 'hello_world.pdf');

/**
 * Each Methods row of the forms pages, on a real engine and a document with no
 * form: build a form from code, fill it in, check it, reset it and move its
 * data in and out.
 */
async function boot() {
  const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  const kernel = createKernel({ engine, plugins: [interactionPlugin(), formPlugin()] });
  const bytes = new Uint8Array(await readFile(fixturePath));
  await kernel.documents.open({ kind: 'bytes', id: 'blank', bytes });
  const form = kernel.capability(FormToken);
  await form.refresh();
  const page = kernel.documents.getPage(0, 'blank')!.ref;
  return {
    kernel,
    form,
    page,
    async [Symbol.asyncDispose]() {
      await kernel.destroy();
      await engine.destroy();
    },
  };
}

type Harness = Awaited<ReturnType<typeof boot>>;

/** A small form: a required name, a checkbox, a radio group, a dropdown, a list and a signature field. */
async function buildForm({ form, page }: Harness) {
  const box = (y: number, x = 72, width = 160, height = 20) => ({ x, y, width, height });
  await form.create({
    family: 'text',
    name: 'customer.name',
    required: true,
    widgets: [{ page, rect: box(100) }],
  });
  await form.create({ family: 'checkbox', name: 'agree', required: true, widgets: [{ page, rect: box(140, 72, 14, 14) }] });
  await form.create({
    family: 'radio',
    name: 'plan',
    widgets: [
      { page, rect: box(180, 72, 14, 14), exportValue: 'monthly' },
      { page, rect: box(180, 160, 14, 14), exportValue: 'yearly' },
    ],
  });
  await form.create({
    family: 'combobox',
    name: 'country',
    required: true,
    options: [
      { label: 'Netherlands', value: 'NL' },
      { label: 'Belgium', value: 'BE' },
    ],
    widgets: [{ page, rect: box(60) }],
  });
  await form.create({
    family: 'listbox',
    name: 'toppings',
    multiSelect: true,
    options: [
      { label: 'Cheese', value: 'cheese' },
      { label: 'Olives', value: 'olives' },
    ],
    widgets: [{ page, rect: box(220, 72, 160, 40) }],
  });
  await form.create({ family: 'signature', name: 'approval', widgets: [{ page, rect: box(280, 72, 160, 40) }] });
}

const names = (fields: readonly FormFieldDTO[]) => fields.map((field) => field.name);

describe('the form capability on a real engine', () => {
  it('builds a form from code: create resolves { field }, the state follows, the events fire', async () => {
    await using harness = await boot();
    const { form } = harness;
    expect(form.getFormKind()).toBe('none');
    const created: FormFieldCreatedEvent[] = [];
    form.onFieldCreated((event) => created.push(event));

    const { field } = await form.create({
      family: 'text',
      name: 'customer.email',
      alternateName: 'Email',
      widgets: [{ page: harness.page, rect: { x: 72, y: 72, width: 160, height: 20 } }],
    });
    expect(field).toMatchObject({ name: 'customer.email', family: 'text', alternateName: 'Email' });
    expect(created.map((event) => event.field.name)).toEqual(['customer.email']);
    expect(created[0]!.origin.kind).toBe('local');
    expect(form.getFormKind()).toBe('acroform');
    expect(formState.read(form)).toMatchObject({ status: 'ready', formKind: 'acroform' });
    expect(names(formState.read(form).fields)).toEqual(['customer.email']);
    expect(form.get(toFieldRef('customer.email'))).toBe(form.get(field.ref));

    const updated = await form.update(field.ref, { required: true });
    expect(updated.field.required).toBe(true);
    expect(form.list({ name: 'customer.email' })[0]!.required).toBe(true);

    await form.delete(field.ref);
    expect(form.get(field.ref)).toBeNull();
  }, 30_000);

  it('lists each page\'s widgets with where they are and how they look', async () => {
    await using harness = await boot();
    const { form, page } = harness;
    await form.ensureLoaded(page);
    await form.create({
      family: 'text',
      name: 'boxed',
      widgets: [
        {
          page,
          rect: { x: 72, y: 100, width: 160, height: 20 },
          color: '#94a3b8',
          interiorColor: '#f8fafc',
          fontSize: 11,
        },
      ],
    });
    await form.create({ family: 'checkbox', name: 'bare', widgets: [{ page, rect: { x: 72, y: 140, width: 14, height: 14 } }] });
    await expect.poll(() => form.listWidgets(0).length).toBe(2);
    const [boxed, bare] = form.listWidgets(page);
    expect(boxed).toMatchObject({
      control: 'text',
      box: { x: 72, y: 100, width: 160, height: 20 },
      look: { border: '#94a3b8', background: '#f8fafc', fontSize: 11 },
      disabled: false,
    });
    expect(bare).toMatchObject({ control: 'toggle', kind: 'checkbox', look: { border: null } });
    expect(form.listWidgets(99)).toEqual([]);
    expect(form.getWidgetAt(0, { x: 80, y: 110 })?.field.name).toBe('boxed');
  }, 30_000);

  it('a radio group is one field with a widget per button, each with its export value', async () => {
    await using harness = await boot();
    await buildForm(harness);
    const plan = harness.form.get(toFieldRef('plan'))!;
    expect(plan.family).toBe('radio');
    expect(plan.widgets.map((widget) => 'exportValue' in widget && widget.exportValue)).toEqual([
      'monthly',
      'yearly',
    ]);
    expect(harness.form.list({ page: 0 })).toHaveLength(6);
    expect(harness.form.list({ family: 'radio' })).toEqual([plan]);
  }, 30_000);

  it('fills fields in with setValue, each shape, and resolves { field, status }', async () => {
    await using harness = await boot();
    await buildForm(harness);
    const { form } = harness;
    const changed: FormValueChangedEvent[] = [];
    form.onValueChanged((event) => changed.push(event));

    const name = await form.setValue(toFieldRef('customer.name'), { value: 'Ada Lovelace' });
    expect(name.status).toBe('applied');
    expect(name.field).toMatchObject({ name: 'customer.name', value: 'Ada Lovelace' });
    expect(changed.map((event) => event.field.name)).toEqual(['customer.name']);

    await form.setValue(toFieldRef('agree'), { checked: true });
    await form.setValue(toFieldRef('plan'), { value: 'yearly' });
    await form.setValue(toFieldRef('country'), { value: 'NL' });
    await form.setValue(toFieldRef('toppings'), { selectedValues: ['cheese', 'olives'] });

    expect(form.getValue(toFieldRef('agree'))).toEqual({ checked: true });
    expect(form.getValue(toFieldRef('agree'))).toBe(form.getValue(toFieldRef('agree')));
    expect(form.exportValues()).toEqual({
      'customer.name': 'Ada Lovelace',
      agree: true,
      plan: 'yearly',
      country: 'NL',
      toppings: ['cheese', 'olives'],
    });
  }, 30_000);

  it('validate() lists the empty required fields in page order', async () => {
    await using harness = await boot();
    await buildForm(harness);
    const { form } = harness;
    // The dropdown sits above the name on the page, so it comes first.
    expect(form.validate()).toMatchObject({ valid: false });
    expect(names(form.validate().missing)).toEqual(['country', 'customer.name', 'agree']);

    await form.setValue(toFieldRef('country'), { value: 'BE' });
    await form.setValue(toFieldRef('customer.name'), { value: 'Ada' });
    await form.setValue(toFieldRef('agree'), { checked: true });
    expect(form.validate()).toEqual({ valid: true, missing: [] });
  }, 30_000);

  it('importValues fills by name and skips what the form does not have', async () => {
    await using harness = await boot();
    await buildForm(harness);
    const { form } = harness;
    const result = await form.importValues({
      'customer.name': 'Ada Lovelace',
      agree: true,
      toppings: ['olives'],
      missing: 'x',
      plan: true,
    });
    expect(result.applied).toHaveLength(3);
    expect(result.skipped.map((entry) => entry.ref)).toEqual(['missing', 'plan']);
    expect(result.failed).toEqual([]);
    expect(form.exportValues()).toMatchObject({ 'customer.name': 'Ada Lovelace', agree: true });
  }, 30_000);

  it('reset() puts back the defaults and resolves the fields it changed', async () => {
    await using harness = await boot();
    await buildForm(harness);
    const { form } = harness;
    await form.setValues([
      { ref: toFieldRef('customer.name'), value: { value: 'Ada' } },
      { ref: toFieldRef('agree'), value: { checked: true } },
    ]);
    const some = await form.reset([toFieldRef('customer.name')]);
    expect(names(some.fields)).toEqual(['customer.name']);
    expect(form.getValue(toFieldRef('agree'))).toEqual({ checked: true });

    // The name is at its default already; a field never written gets its first value.
    const all = await form.reset();
    expect(names(all.fields)).toContain('agree');
    expect(names(all.fields)).not.toContain('customer.name');
    expect(form.exportValues()).toMatchObject({ agree: false });
    expect(form.exportValues()['customer.name']).toBeUndefined();
  }, 30_000);

  it('moves the form data out as XFDF and back in', async () => {
    await using harness = await boot();
    await buildForm(harness);
    const { form } = harness;
    await form.setValue(toFieldRef('customer.name'), { value: 'Ada Lovelace' });
    const exported = await form.export();
    expect(exported.format).toBe('xfdf');
    await form.reset();
    const imported = await form.import(exported.bytes);
    expect(imported.applied).toBeGreaterThan(0);
    expect(form.getValue(toFieldRef('customer.name'))).toEqual({ value: 'Ada Lovelace' });
  }, 30_000);

  it('removeWidget takes one widget out of a field that shows in several places', async () => {
    await using harness = await boot();
    await buildForm(harness);
    const { form } = harness;
    const plan = form.get(toFieldRef('plan'))!;
    const { field } = await form.removeWidget(plan.ref, plan.widgets[1]!.ref!);
    expect(field.widgets).toHaveLength(1);
  }, 30_000);

  it('a cancelled write rejects operation-cancelled; the settings change for every document', async () => {
    await using harness = await boot();
    await buildForm(harness);
    const { form } = harness;
    const controller = new AbortController();
    controller.abort();
    await expect(
      form.setValue(toFieldRef('customer.name'), { value: 'x' }, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'operation-cancelled' });

    expect(form.getSettings().fields.color).toBe('#1f2a44');
    form.updateSettings({ focus: { color: '#e91e63' } });
    expect(harness.kernel.settingsOf(FormToken).getSettings().focus.color).toBe('#e91e63');
    form.resetSettings();
    expect(form.getSettings().focus.color).toBeNull();
  }, 30_000);
});
