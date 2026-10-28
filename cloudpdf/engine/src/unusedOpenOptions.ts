import {
  devWarn,
  type DocumentHandle,
  type Identity,
  type OpenOptions,
} from '@embedpdf/engine-core/runtime';

/**
 * Say, in development, what the page passed to `open()` that the document doesn't use, so
 * nothing is ignored silently. The document's token decides what the session may do, so
 * `scope` never applies here. It also decides who the session acts for: a share link takes the
 * page's `identity` as the visitor's answers, and only what it asks.
 */
export function warnUnusedOpenOptions(
  options: OpenOptions | undefined,
  handle: DocumentHandle,
  from: 'token' | 'share',
): void {
  if (options?.scope !== undefined) {
    devWarn(
      'open-scope',
      "[cloudpdf] open(): the cloud engine doesn't use `scope`: the document's token says what " +
        'the session may do (`doc.security` reads it).',
    );
  }
  const given = options?.identity;
  if (!given) return;
  const actsFor: Identity = handle.security.identity ?? {};
  const unused = (Object.keys(given) as (keyof Identity)[]).filter(
    (field) => given[field] !== undefined && given[field] !== actsFor[field],
  );
  if (unused.length === 0) return;
  const why =
    from === 'share'
      ? 'a share link takes only the fields it asks its visitors, never `userId` or ' +
        '`groupId`; an answer once given stays, and a link that says who its visitors are ' +
        'prevails'
      : "the document's token says who the user is";
  devWarn(
    `open-identity:${from}:${unused.join(',')}`,
    `[cloudpdf] open(): this document doesn't act for the \`identity\` you passed ` +
      `(${unused.join(', ')}): ${why}. \`doc.security.identity\` says who it acts for.`,
  );
}
