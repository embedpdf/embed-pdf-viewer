/** A request's schema issues as one message: `path: problem`, joined by `; `. */
export function formatIssues(
  issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }>,
): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.map(String).join('.') : 'request body';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}
