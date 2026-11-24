// What each person may do, as permissions: the sender places fields for both signers, and each
// signer fills in and signs their own.
const see = ['doc.open', 'doc.render', 'doc.download', 'doc.forms.read'];

export const people = {
  sender: {
    name: 'The sender',
    scope: [
      ...see,
      'doc.forms.modify',
      'fields:set-group:group=borrower',
      'fields:set-group:group=approver',
    ],
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
