import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveServerRecovery } from './resolve-server-recovery.mjs';

function fixture() {
  const sourceSha = 'a'.repeat(40);
  const state = {
    run: {
      path: '.github/workflows/release.yml',
      head_branch: 'main',
      event: 'push',
      head_repository: { full_name: 'embedpdf/embed-pdf-viewer' },
      status: 'completed',
      conclusion: 'failure',
      head_sha: sourceSha,
    },
    jobs: [{ name: 'release', conclusion: 'success' }],
    manifest: { name: '@cloudpdf/server', version: '3.0.0-next.13' },
    published: { name: '@cloudpdf/server', version: '3.0.0-next.13', gitHead: sourceSha },
    artifacts: [
      { name: 'engine-runtime-linux-x64', expired: false },
      { name: 'engine-runtime-linux-arm64', expired: false },
    ],
    registryStatus: 200,
    requests: [],
  };
  const github = {
    rest: {
      actions: {
        getWorkflowRun: async (params) => {
          assert.equal(params.run_id, '35141597088');
          return { data: state.run };
        },
        listJobsForWorkflowRun: 'jobs',
        listWorkflowRunArtifacts: 'artifacts',
      },
      repos: {
        getContent: async (params) => {
          state.requests.push(params);
          return {
            data: { content: Buffer.from(JSON.stringify(state.manifest)).toString('base64') },
          };
        },
      },
    },
    paginate: async (endpoint, params) => {
      assert.equal(params.run_id, '35141597088');
      if (endpoint === 'jobs') assert.equal(params.filter, 'all');
      return state[endpoint];
    },
  };
  return {
    state,
    options: {
      github,
      repository: { owner: 'embedpdf', repo: 'embed-pdf-viewer' },
      runId: '35141597088',
      fetchImpl: async (url) => {
        assert.equal(url, 'https://registry.npmjs.org/@cloudpdf%2fserver/next');
        return {
          ok: state.registryStatus === 200,
          status: state.registryStatus,
          json: async () => state.published,
        };
      },
    },
  };
}

test('recovers the published source and original artifacts after an image failure', async () => {
  const { state, options } = fixture();
  assert.deepEqual(await resolveServerRecovery(options), {
    runId: '35141597088',
    sourceSha: state.run.head_sha,
    version: '3.0.0-next.13',
  });
  assert.equal(state.requests[0].ref, state.run.head_sha);
});

test('accepts a successful npm job from an earlier attempt', async () => {
  const { state, options } = fixture();
  state.jobs.unshift({ name: 'release', conclusion: 'skipped' });
  await resolveServerRecovery(options);
});

test('accepts registry metadata without the optional gitHead field', async () => {
  const { state, options } = fixture();
  delete state.published.gitHead;
  await resolveServerRecovery(options);
});

for (const runId of ['', '0', '-1', '123/attempts/2', '1\n2']) {
  test(`rejects invalid run ID ${JSON.stringify(runId)}`, async () => {
    const { options } = fixture();
    await assert.rejects(resolveServerRecovery({ ...options, runId }), /positive workflow run ID/);
  });
}

for (const change of [
  { path: '.github/workflows/server-tests.yml' },
  { head_branch: 'feature/test' },
  { event: 'pull_request' },
  { head_repository: { full_name: 'someone/fork' } },
  { status: 'in_progress' },
  { head_sha: 'main' },
]) {
  test(`rejects unrelated or unfinished run ${JSON.stringify(change)}`, async () => {
    const { state, options } = fixture();
    Object.assign(state.run, change);
    await assert.rejects(resolveServerRecovery(options), /completed Release run/);
  });
}

for (const conclusion of ['failure', 'skipped', 'cancelled']) {
  test(`rejects ${conclusion} npm publication`, async () => {
    const { state, options } = fixture();
    state.jobs[0].conclusion = conclusion;
    await assert.rejects(resolveServerRecovery(options), /npm release job must have succeeded/);
  });
}

test('refuses to move next back to an older release', async () => {
  const { state, options } = fixture();
  state.published.version = '3.0.0-next.14';
  await assert.rejects(resolveServerRecovery(options), /current next version/);
});

test('rejects a version published from different source', async () => {
  const { state, options } = fixture();
  state.published.gitHead = 'b'.repeat(40);
  await assert.rejects(resolveServerRecovery(options), /different source commit/);
});

test('stops if npm cannot confirm publication', async () => {
  const { state, options } = fixture();
  state.registryStatus = 404;
  await assert.rejects(resolveServerRecovery(options), /HTTP 404/);
});

test('rejects a stable release in the next-channel workflow', async () => {
  const { state, options } = fixture();
  state.manifest.version = '3.0.0';
  await assert.rejects(resolveServerRecovery(options), /next-channel/);
});

for (const target of ['linux-x64', 'linux-arm64']) {
  for (const missing of [true, false]) {
    test(`rejects ${missing ? 'missing' : 'expired'} ${target} binaries`, async () => {
      const { state, options } = fixture();
      const name = `engine-runtime-${target}`;
      if (missing) state.artifacts = state.artifacts.filter((artifact) => artifact.name !== name);
      else state.artifacts.find((artifact) => artifact.name === name).expired = true;
      await assert.rejects(resolveServerRecovery(options), /missing or expired/);
    });
  }
}
