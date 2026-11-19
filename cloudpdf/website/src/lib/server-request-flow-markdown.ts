import { mdast, type AstNode } from '@embedpdf/docs-kit';

import { serverRequestFlow as flow } from './server-request-flow';

const { inlineCode, link, list, listItem, paragraph, strong, text } = mdast;

export function projectServerRequestFlow(absoluteContentUrl: (url: string) => string): AstNode[] {
  const { sharedSecret, publicKey, handoff, requestStep, browser } = flow;
  const engineLink: AstNode = {
    type: 'link',
    url: absoluteContentUrl(browser.engine.href),
    children: [inlineCode(browser.engine.name)],
  };

  return [
    paragraph([strong(flow.signingLabel)]),
    list([
      listItem([
        paragraph([
          strong(`${sharedSecret.title} (${sharedSecret.method}).`),
          text(` ${sharedSecret.lead}`),
          link(absoluteContentUrl(sharedSecret.action.href), sharedSecret.action.label),
          text(sharedSecret.end),
        ]),
      ]),
      listItem([
        paragraph([
          strong(`${publicKey.title} (${publicKey.method}).`),
          text(` ${publicKey.description}`),
        ]),
      ]),
    ]),
    paragraph([strong(flow.viewingLabel)]),
    {
      ...list([
        listItem([paragraph([text(handoff.lead), strong(handoff.token), text('.')])]),
        listItem([paragraph([text(requestStep.lead), engineLink, text(requestStep.end)])]),
        listItem([paragraph([text(flow.responseStep)])]),
      ]),
      ordered: true,
    },
  ];
}
