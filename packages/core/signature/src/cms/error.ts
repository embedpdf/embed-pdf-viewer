/** A CMS that can't be used: `malformed` when it isn't one, `unsupported` when this package can't read it. */
export class CmsError extends Error {
  constructor(
    readonly reason: 'malformed' | 'unsupported',
    message: string,
  ) {
    super(message);
    this.name = 'CmsError';
  }
}
