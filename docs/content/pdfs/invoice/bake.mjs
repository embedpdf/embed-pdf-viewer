/**
 * The order form. Each amount is its quantity times the price, the total adds them up, and the
 * date takes day/month/year: all form scripts, so they run where JavaScript is on. No signature.
 */
const look = { fontSize: 11 };

const PRICES = { license: 290, support: 120, onboarding: 80 };

export default async function bake({ edit }) {
  await edit(async ({ doc, place }) => {
    const forms = doc.forms;

    await forms.create({
      family: 'text',
      name: 'billing.name',
      required: true,
      alternateName: 'Bill to',
      widgets: [{ ...place('billing.name'), ...look }],
    });
    await forms.create({
      family: 'combobox',
      name: 'billing.country',
      alternateName: 'Country',
      options: [
        { label: 'Netherlands', value: 'NL' },
        { label: 'Belgium', value: 'BE' },
        { label: 'Germany', value: 'DE' },
        { label: 'United Kingdom', value: 'GB' },
        { label: 'United States', value: 'US' },
      ],
      widgets: [{ ...place('billing.country'), ...look }],
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
      family: 'text',
      name: 'date',
      alternateName: 'Order date, as day/month/year',
      actions: {
        keystroke: { type: 'javascript', script: 'AFDate_KeystrokeEx("dd/mm/yyyy");' },
        format: { type: 'javascript', script: 'AFDate_FormatEx("dd/mm/yyyy");' },
      },
      widgets: [{ ...place('date'), ...look }],
    });

    await doc.metadata.update({
      title: 'Order form and invoice',
      author: 'EmbedPDF',
      subject: 'An order for licenses, support and onboarding, with amounts that add up',
      keywords: 'EmbedPDF, order form, invoice',
    });
  });
}
