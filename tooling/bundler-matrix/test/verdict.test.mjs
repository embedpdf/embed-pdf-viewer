import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resultCell, unexpected } from '../verdict.mjs';

/** A build row that passed, with `changes` on top. */
const row = (changes = {}) => ({
  app: 'app',
  dev: false,
  build: 'ok',
  probe: { ok: true },
  foreign: [],
  csp: { violations: [] },
  ok: true,
  ...changes,
});

/** The row as the runner keeps it: with what its entry does not allow. */
const kept = (changes) => {
  const finished = row(changes);
  return { ...finished, unexpected: unexpected(finished) };
};

describe('a matrix row against its entry', () => {
  it('is as expected when it builds, boots, stays on its origin and keeps the policy', () => {
    assert.equal(unexpected(row()), null);
    assert.equal(unexpected(row({ dev: true, csp: undefined })), null);
  });

  it('has to build', () => {
    // A row that did not build was never opened: it has no probe and no requests.
    const unbuilt = { app: 'app', dev: false, build: 'failed', ok: false };
    assert.equal(unexpected(unbuilt), 'its build failed');
    assert.equal(unexpected({ ...unbuilt, dev: true }), 'its dev server did not start');
  });

  it('has to boot', () => {
    assert.equal(unexpected(row({ probe: { ok: false }, ok: false })), 'it did not boot');
    assert.equal(
      unexpected(row({ dev: true, csp: undefined, probe: { ok: false }, ok: false })),
      'it did not boot',
    );
  });

  it('has to stay on its origin and keep the policy, and names everything it broke', () => {
    assert.equal(
      unexpected(row({ foreign: ['https://cdn.example'], ok: false })),
      'a request left its origin, to https://cdn.example',
    );
    assert.equal(
      unexpected(row({ csp: { violations: ['worker-src blocked blob:'] }, ok: false })),
      'it violated the policy',
    );
    assert.equal(
      unexpected(
        row({
          probe: { ok: false },
          foreign: ['https://cdn.example'],
          csp: { violations: ['worker-src blocked blob:'] },
          ok: false,
        }),
      ),
      'it did not boot; a request left its origin, to https://cdn.example; it violated the policy',
    );
  });

  describe('that fails by design', () => {
    const byDesign = {
      failsByDesign: 'the bundler emits no files',
      probe: { ok: false },
      ok: false,
    };

    it('is as expected when it builds and does not boot', () => {
      assert.equal(unexpected(row(byDesign)), null);
    });

    it('still has to build, stay on its origin and keep the policy', () => {
      assert.equal(
        unexpected({ app: 'app', dev: false, build: 'failed', ok: false, ...byDesign }),
        'its build failed',
      );
      assert.equal(
        unexpected(row({ ...byDesign, foreign: ['https://cdn.example'] })),
        'a request left its origin, to https://cdn.example',
      );
      assert.equal(
        unexpected(row({ ...byDesign, csp: { violations: ['script-src blocked (inline)'] } })),
        'it violated the policy',
      );
    });

    it('has an entry that is out of date once it boots', () => {
      assert.equal(
        unexpected(row({ ...byDesign, probe: { ok: true }, ok: true })),
        'it booted, and its matrix.json entry says it fails by design',
      );
    });
  });
});

describe("a matrix row's Result cell", () => {
  it('shows a pass and a failure', () => {
    assert.equal(resultCell(kept()), '✅');
    assert.equal(resultCell(kept({ probe: { ok: false }, ok: false })), '❌');
    assert.equal(
      resultCell({ app: 'app', build: 'failed', ok: false, unexpected: 'its build failed' }),
      '❌',
    );
  });

  it('says so when the failure is the one its entry expects, and only then', () => {
    const byDesign = {
      failsByDesign: 'the bundler emits no files',
      probe: { ok: false },
      ok: false,
    };
    assert.equal(resultCell(kept(byDesign)), '❌ by design');
    assert.equal(resultCell(kept({ ...byDesign, foreign: ['https://cdn.example'] })), '❌');
    assert.equal(resultCell(kept({ ...byDesign, probe: { ok: true }, ok: true })), '✅');
  });
});
