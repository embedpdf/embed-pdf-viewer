/**
 * Whether a finished row did what its `matrix.json` entry says it does. The runner exits
 * non-zero when one did not, so a row that stops building or booting fails the run.
 */

/**
 * What `row` did that its entry does not allow, or null. Every row has to build (a dev row:
 * install and start), boot the probe, stay on its origin and keep the policy. A row whose
 * entry gives `failsByDesign` has to do all of that except boot: one that boots has an entry
 * that is out of date.
 */
export function unexpected(row) {
  if (row.build !== 'ok') return row.dev ? 'its dev server did not start' : 'its build failed';
  const problems = [];
  if (row.failsByDesign) {
    if (row.probe.ok) problems.push('it booted, and its matrix.json entry says it fails by design');
  } else if (!row.probe.ok) problems.push('it did not boot');
  if (row.foreign.length) problems.push(`a request left its origin, to ${row.foreign.join(', ')}`);
  if (row.csp?.violations.length) problems.push('it violated the policy');
  return problems.length ? problems.join('; ') : null;
}

/** The row's Result cell: whether it passed, and for a failure its entry expects, that it does. */
export function resultCell(row) {
  return `${row.ok ? '✅' : '❌'}${row.failsByDesign && !row.unexpected ? ' by design' : ''}`;
}
