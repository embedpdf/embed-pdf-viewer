// The sender places fields for both signers. Each signer fills in and signs their own, and your
// app knows who each of them is.
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
    identity: null,
  },
  borrower: {
    name: 'Dana Smith',
    scope: [...see, 'fields:fill:group=borrower', 'fields:sign:group=borrower'],
    identity: {
      userId: 'u_381',
      displayName: 'Dana Smith',
      email: 'dana@fernquill.example',
      organization: 'Fernquill Ltd',
      title: 'Operations',
    },
  },
  approver: {
    name: 'Ada Lovelace',
    scope: [...see, 'fields:fill:group=approver', 'fields:sign:group=approver'],
    identity: {
      userId: 'u_412',
      displayName: 'Ada Lovelace',
      email: 'ada@fernquill.example',
      organization: 'Fernquill Ltd',
      title: 'Finance',
    },
  },
};

export type Person = keyof typeof people;

// Who the document's groups are: your app's own list. The PDF holds only each field's group id.
export const signers = [
  { id: 'borrower', label: 'Dana Smith', color: '#2563eb' },
  { id: 'approver', label: 'Ada Lovelace' }, // a color is picked for it
];
