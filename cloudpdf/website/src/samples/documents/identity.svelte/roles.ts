export const dana = { userId: 'u_381', displayName: 'Dana Smith' };

// What each role may do, as permissions.
export const roles = {
  reader: ['doc.open', 'doc.render', 'doc.text.select'],
  editor: [
    'doc.open',
    'doc.render',
    'doc.text.select',
    'doc.text.copy',
    'doc.download',
    'doc.print',
  ],
};
export type Role = keyof typeof roles;
