const result = 'pages, text, and metadata';

export const serverRequestFlow = {
  label: 'Document token and PDF request flow',
  signingLabel: 'Who signs the JWT',
  sharedSecret: {
    title: 'CloudPDF signs',
    method: 'shared secret, HS256',
    lead: 'Your backend calls the ',
    action: { label: 'issue token API', href: '/docs/api-reference/tokens/issue' },
    end: '. CloudPDF signs and returns the JWT.',
  },
  publicKey: {
    title: 'Your backend signs',
    method: 'public-key verification',
    description:
      'Your backend signs with its private key. CloudPDF verifies with the matching public key.',
  },
  viewingLabel: 'How the browser opens the document',
  handoff: { lead: 'Your backend gives the browser a ', token: 'short-lived document JWT' },
  browser: { title: 'Your frontend', engine: { name: '@cloudpdf/engine', href: '/docs/engine' } },
  cloudpdf: { title: 'CloudPDF server', detail: 'Verifies access' },
  request: 'Bearer JWT',
  result,
  requestStep: {
    lead: 'The browser uses ',
    end: ' to send the JWT to CloudPDF as a Bearer token.',
  },
  responseStep: `CloudPDF verifies access and returns ${result}.`,
};
