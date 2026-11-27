// What each person may do, as permissions: the sender places fields for both signers and for
// anyone, and each signer fills in and signs their own, and fills in anyone's.
const see = ['doc.open', 'doc.render', 'doc.download', 'doc.forms.read'];

export const people = {
  sender: {
    name: 'The sender',
    // Every group: a field anyone fills in is every group's.
    scope: [...see, 'doc.forms.modify', 'fields:set-group:all'],
  },
  borrower: {
    name: 'Dana Smith',
    scope: [...see, 'fields:fill:group=borrower', 'fields:sign:group=borrower'],
  },
  approver: {
    name: 'Ada Lovelace',
    scope: [...see, 'fields:fill:group=approver', 'fields:sign:group=approver'],
  },
};

export type Person = keyof typeof people;

// Who the document's groups are: your app's own list. The PDF holds only each field's group id.
export const signers = [
  { id: 'borrower', label: 'Dana Smith', color: '#2563eb' },
  { id: 'approver', label: 'Ada Lovelace' }, // a color is picked for it
];

// The color a field anyone fills in shows in: the form's `fields.anyoneTintColor`.
export const ANYONE = 'var(--epdf-form-field-anyone-tint-color, #0891b2)';
