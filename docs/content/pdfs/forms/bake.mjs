/**
 * The forms document. The HTML draws each field's box; this puts a field over it. The fields
 * have no border or background of their own, so the printed box shows, and a viewer may draw
 * its own field style on top. The invoice's sums and the date check are form scripts.
 */
const look = { fontSize: 11 };

const PRICES = { license: 290, support: 120, onboarding: 80 };

export default async function bake({ edit }) {
  await edit(async ({ doc, pages, place, places }) => {
    const forms = doc.forms;
    const field = (name, family, settings = {}) =>
      forms.create({ family, name, ...settings, widgets: [{ ...place(name), ...look }] });
    const choices = (labels) => labels.map((label) => ({ label, value: label }));

    // Sign up
    await field('name', 'text', { required: true, alternateName: 'Full name' });
    await field('email', 'text', { required: true, alternateName: 'Email' });
    await field('company', 'text', { alternateName: 'Company' });
    await field('framework', 'combobox', {
      alternateName: 'Framework',
      options: choices(['React', 'Vue', 'Svelte', 'Angular']),
    });
    await field('updates', 'checkbox', { alternateName: 'Send me product updates' });
    await field('terms', 'checkbox', { required: true, alternateName: 'I agree to the terms' });

    // Your plan
    await forms.create({
      family: 'radio',
      name: 'plan',
      alternateName: 'Billing',
      noToggleToOff: true,
      widgets: places('plan').map(({ value, ...placement }) => ({
        ...placement,
        exportValue: value,
      })),
    });
    await field('topics', 'listbox', {
      alternateName: 'Topics you care about',
      multiSelect: true,
      options: choices(['Forms', 'Annotations', 'Signatures']),
    });

    // Invoice: each amount is its quantity times the price, and the total adds them up.
    await field('billing.name', 'text', { required: true, alternateName: 'Bill to' });
    await field('billing.country', 'combobox', {
      alternateName: 'Country',
      options: [
        { label: 'Netherlands', value: 'NL' },
        { label: 'Belgium', value: 'BE' },
        { label: 'Germany', value: 'DE' },
        { label: 'United Kingdom', value: 'GB' },
        { label: 'United States', value: 'US' },
      ],
    });
    const money = { type: 'javascript', script: 'AFNumber_Format(2, 0, 0, 0, "$", true);' };
    for (const item of Object.keys(PRICES)) {
      await forms.create({
        family: 'text',
        name: `invoice.${item}.qty`,
        alternateName: 'Quantity',
        maxLength: 3,
        actions: {
          keystroke: { type: 'javascript', script: 'AFNumber_Keystroke(0, 0, 0, 0, "", true);' },
        },
        widgets: [{ ...place(`invoice.${item}.qty`), ...look, textAlign: 'center' }],
      });
    }
    for (const [item, price] of Object.entries(PRICES)) {
      await forms.create({
        family: 'text',
        name: `invoice.${item}.amount`,
        alternateName: 'Amount',
        readOnly: true,
        actions: {
          calculate: {
            type: 'javascript',
            script: `event.value = this.getField("invoice.${item}.qty").value * ${price};`,
          },
          format: money,
        },
        widgets: [{ ...place(`invoice.${item}.amount`), ...look, textAlign: 'right' }],
      });
    }
    const amounts = Object.keys(PRICES).map((item) => `"invoice.${item}.amount"`);
    await forms.create({
      family: 'text',
      name: 'invoice.total',
      alternateName: 'Total',
      readOnly: true,
      actions: {
        calculate: {
          type: 'javascript',
          script: `AFSimple_Calculate("SUM", [${amounts.join(', ')}]);`,
        },
        format: money,
      },
      widgets: [{ ...place('invoice.total'), fontSize: 13, textAlign: 'right' }],
    });
    await forms.create({
      family: 'signature',
      name: 'approval',
      required: true,
      alternateName: 'Signature',
      widgets: [place('approval')],
    });
    await field('date', 'text', {
      alternateName: 'Date, as DD/MM/YYYY',
      actions: {
        keystroke: { type: 'javascript', script: 'AFDate_KeystrokeEx("dd/mm/yyyy");' },
        format: { type: 'javascript', script: 'AFDate_FormatEx("dd/mm/yyyy");' },
      },
    });

    await doc.metadata.update({
      title: 'Fill it in, right on the page',
      author: 'EmbedPDF',
      subject:
        'A demo form with every kind of field, an invoice that adds itself up, and a signature',
      keywords: 'EmbedPDF, PDF, forms, AcroForm, demo',
    });

    const chapters = [
      'Fill it in, right on the page',
      'Sign up',
      'Your plan',
      'Invoice',
      'Your turn',
    ];
    for (const [index, title] of chapters.entries()) {
      await doc.outline.create({
        title,
        target: { kind: 'goto', destination: { kind: 'fit', page: pages[index].ref } },
      });
    }
  });
}
