// Read-only preflight for a new Release run recovering server images after
// npm publication. Never rebuild an old version from the current main tree.
export async function resolveServerRecovery({ github, repository, runId, fetchImpl = fetch }) {
  if (!/^[1-9]\d*$/.test(runId ?? '')) {
    throw new Error('recover_server_run_id must be a positive workflow run ID.');
  }

  const params = { ...repository, run_id: runId };
  const { data: run } = await github.rest.actions.getWorkflowRun(params);
  if (
    run.path !== '.github/workflows/release.yml' ||
    run.head_branch !== 'main' ||
    !['push', 'workflow_dispatch'].includes(run.event) ||
    run.head_repository?.full_name !== `${repository.owner}/${repository.repo}` ||
    run.status !== 'completed' ||
    !/^[a-f0-9]{40}$/.test(run.head_sha)
  ) {
    throw new Error('Recovery requires a completed Release run from this repository on main.');
  }

  // Include earlier attempts: a failed-jobs rerun may have reused the
  // successful npm job from the original attempt.
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
    ...params,
    filter: 'all',
    per_page: 100,
  });
  if (!jobs.some((job) => job.name === 'release' && job.conclusion === 'success')) {
    throw new Error('The original npm release job must have succeeded before recovering images.');
  }

  const { data: file } = await github.rest.repos.getContent({
    ...repository,
    path: 'cloudpdf/server/package.json',
    ref: run.head_sha,
  });
  const manifest = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
  if (manifest.name !== '@cloudpdf/server' || !/^\d+\.\d+\.\d+-next\.\d+$/.test(manifest.version)) {
    throw new Error('The original source must contain a next-channel @cloudpdf/server version.');
  }

  // Image recovery updates the `next` tag. Refuse stale releases rather than
  // rolling that tag back or putting unpublished source under a release tag.
  const response = await fetchImpl('https://registry.npmjs.org/@cloudpdf%2fserver/next', {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Cannot verify the published server version on npm (HTTP ${response.status}).`);
  }
  const published = await response.json();
  if (published.name !== manifest.name || published.version !== manifest.version) {
    throw new Error(`Recovery requires npm's current next version to be ${manifest.version}.`);
  }
  if (published.gitHead && published.gitHead !== run.head_sha) {
    throw new Error('The npm package was published from a different source commit.');
  }

  const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, {
    ...params,
    per_page: 100,
  });
  for (const target of ['linux-x64', 'linux-arm64']) {
    const name = `engine-runtime-${target}`;
    if (!artifacts.some((artifact) => artifact.name === name && !artifact.expired)) {
      throw new Error(
        `Original artifact ${name} is missing or expired; create a new server release.`,
      );
    }
  }

  return { runId, sourceSha: run.head_sha, version: manifest.version };
}
