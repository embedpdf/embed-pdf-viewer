/**
 * Lanternfield's membership application. The HTML draws each field's box; this puts a field over
 * it. The fields have no border or background of their own, so the printed box shows, and a viewer
 * may draw its own field style on top. No scripts and no signature: every example that opens it
 * can fill in everything it shows.
 */
import { LANTERNFIELD } from '../shared/annotations.mjs';

export const company = LANTERNFIELD;

const look = { fontSize: 11 };

export default async function bake({ edit }) {
  await edit(async ({ doc, place, places }) => {
    const forms = doc.forms;
    const field = (name, family, settings = {}) =>
      forms.create({ family, name, ...settings, widgets: [{ ...place(name), ...look }] });
    const choices = (labels) => labels.map((label) => ({ label, value: label }));

    await field('name', 'text', { required: true, alternateName: 'Full name' });
    await field('email', 'text', { required: true, alternateName: 'Email' });
    await field('company', 'text', { alternateName: 'Company' });
    await field('framework', 'combobox', {
      alternateName: 'Framework your app uses',
      options: choices(['React', 'Vue', 'Svelte', 'Angular']),
    });
    await forms.create({
      family: 'radio',
      name: 'plan',
      alternateName: 'Plan',
      noToggleToOff: true,
      widgets: places('plan').map(({ value, ...placement }) => ({
        ...placement,
        exportValue: value,
      })),
    });
    await field('topics', 'listbox', {
      alternateName: 'Topics for your onboarding call',
      multiSelect: true,
      options: choices(['Forms', 'Annotations', 'Signatures']),
    });
    await field('updates', 'checkbox', { alternateName: 'Send me product news' });
    await field('terms', 'checkbox', {
      required: true,
      alternateName: 'I agree to the membership terms',
    });

    await doc.metadata.update({
      title: 'Apply for Lanternfield Pro',
      author: 'Lanternfield',
      subject: 'The membership application for priority support and an onboarding call',
      keywords: 'Lanternfield, membership, application form',
    });
  });
}
