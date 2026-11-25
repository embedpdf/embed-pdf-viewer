import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PULL_REQUEST_LIMIT,
  RELEASE_LIMIT,
  releaseNotes,
  writeNotes,
  writePullRequestNotes,
} from './release-notes.mjs';

const repository = { owner: 'embedpdf', repo: 'embed-pdf-viewer' };
const HOME = 'https://github.com/embedpdf/embed-pdf-viewer';
const CHANGESETS_TEXT = 'This PR was opened by the Changesets release GitHub action.';

const pullLink = (number) => `[#${number}](${HOME}/pull/${number})`;
const by = (login) => `by [@${login}](https://github.com/${login})`;

/** A package whose changelog has `section` for 3.4.0, above an older version. */
function pkg(directory, section = '', name = `@embedpdf/${directory.split('/').at(-1)}`) {
  const entries = section ? `\n### Minor Changes\n\n${section}\n` : '';
  return {
    name,
    version: '3.4.0',
    directory,
    changelog: `# ${name}\n\n## 3.4.0\n${entries}\n## 3.3.0\n\n- An older note.\n`,
  };
}

function notesOf(packages, limit = Infinity) {
  return writeNotes(packages, { repository, ref: 'v3.4.0', limit });
}

/** The lines of one package's section. */
function sectionOf(notes, name) {
  const start = notes.indexOf(`## ${name}@3.4.0`);
  assert.notEqual(start, -1, `${name} is in the notes`);
  const end = notes.indexOf('\n## ', start);
  return notes.slice(start, end < 0 ? undefined : end).trim();
}

test('a package has its version and its entries, under their headings', () => {
  const changelog = [
    '# @embedpdf/react',
    '## 3.4.0',
    '### Minor Changes',
    `- ${pullLink(1)} ${by('bobsingor')} – A feature.`,
    '  - Its first part.',
    '### Patch Changes',
    `- ${pullLink(2)} ${by('bobsingor')} – A fix.`,
    '## 3.3.0',
    '- An older note.',
  ].join('\n\n');

  assert.equal(
    notesOf([{ ...pkg('packages/framework/react'), changelog }]),
    [
      '## @embedpdf/react@3.4.0',
      '### Minor Changes',
      '- #1 – A feature.',
      '  - Its first part.',
      '### Patch Changes',
      '- #2 – A fix.',
    ].join('\n\n'),
  );
});

test('a link to another repository, and a contributor, stay', () => {
  const other = '[#7](https://github.com/changesets/action/pull/7)';
  const issue = `[#8](${HOME}/issues/8)`;
  const notes = notesOf([
    pkg('packages/core/ui', `- ${pullLink(3)} ${by('a-contributor')} – See ${other} and ${issue}.`),
  ]);

  assert.match(notes, /^- #3 by \[@a-contributor\]\(https:\/\/github\.com\/a-contributor\) – /m);
  assert.ok(notes.includes(`See ${other} and #8.`));
});

test('packages with no changes are one line', () => {
  const changed = pkg('packages/core/ui', '- A fix.');
  const empty = pkg('packages/core/text');
  const onlyHeading = { ...empty, changelog: '## 3.4.0\n\n### Patch Changes\n\n## 3.3.0\n' };
  const noChangelog = { ...empty, changelog: '' };

  assert.ok(
    notesOf([changed, empty, onlyHeading, noChangelog]).endsWith(
      '## Other packages\n\n3 more packages get a new version with no changes of their own.',
    ),
  );
  assert.match(notesOf([changed, empty]), /^1 more package gets a new version/m);
  assert.match(notesOf([empty, onlyHeading]), /^2 packages get a new version/m);
  assert.doesNotMatch(notesOf([changed]), /Other packages/);
});

test('the packages people install come first', () => {
  const directories = [
    'packages/core/ui',
    'packages/engine/services',
    'packages/plugin/form',
    'cloudpdf/contract',
    'cloudpdf/server-modules',
    'cloudpdf/server',
    'cloudpdf/viewer/react',
    'packages/engine/main',
    'packages/framework/react',
    'packages/viewer/chrome',
    'packages/viewer/main',
    'somewhere/else',
  ];
  const notes = notesOf(directories.map((at) => pkg(at, '- A fix.', at)));

  assert.deepEqual(
    [...notes.matchAll(/^## (.+)@3\.4\.0$/gm)].map(([, name]) => name),
    [
      'packages/viewer/main',
      'packages/viewer/chrome',
      'packages/framework/react',
      'packages/engine/main',
      'cloudpdf/viewer/react',
      'cloudpdf/server',
      'cloudpdf/contract',
      'cloudpdf/server-modules',
      'packages/plugin/form',
      'packages/core/ui',
      'packages/engine/services',
      'somewhere/else',
    ],
  );
});

const LONG = [
  '- #1 – The first sentence. A second one.',
  `  ${'More about it. '.repeat(20).trim()}`,
  '- #2 – A short fix.',
].join('\n\n');

test('notes that fit are written whole', () => {
  const packages = [pkg('packages/core/ui', LONG), pkg('packages/core/text', '- #3 – A fix.')];
  const whole = notesOf(packages);

  assert.equal(notesOf(packages, whole.length), whole);
  assert.doesNotMatch(whole, /…|Full notes/);
});

test('over the limit the longest entry is shortened, and its package links its changelog', () => {
  const packages = [pkg('packages/core/ui', LONG), pkg('packages/core/text', '- #3 – A fix.')];
  const notes = notesOf(packages, notesOf(packages).length - 1);

  assert.equal(
    sectionOf(notes, '@embedpdf/ui'),
    [
      '## @embedpdf/ui@3.4.0',
      '### Minor Changes',
      '- #1 – The first sentence. A second one. …',
      '- #2 – A short fix.',
      `[Full notes](${HOME}/blob/v3.4.0/packages/core/ui/CHANGELOG.md#340)`,
    ].join('\n\n'),
  );
  assert.doesNotMatch(sectionOf(notes, '@embedpdf/text'), /…|Full notes/);
});

test('a shorter entry stays whole while shortening a longer one is enough', () => {
  const entry = (number, times) => `- #${number} – A sentence. ${'More. '.repeat(times).trim()}`;
  const packages = [pkg('packages/core/ui', `${entry(1, 10)}\n\n${entry(2, 40)}`)];
  const notes = notesOf(packages, notesOf(packages).length - 1);

  assert.ok(notes.includes(entry(1, 10)));
  assert.match(notes, /^- #2 – A sentence\. …$/m);
});

test('still over the limit, an entry keeps its first sentence', () => {
  const packages = [pkg('packages/core/ui', LONG)];
  const paragraph = notesOf(packages, notesOf(packages).length - 1);

  assert.match(notesOf(packages, paragraph.length - 1), /^- #1 – The first sentence\. …$/m);
});

test('a changelog is linked at the version as GitHub names its heading', () => {
  const prerelease = pkg('packages/core/ui', LONG);
  const notes = notesOf(
    [
      {
        ...prerelease,
        version: '4.0.0-next.2',
        changelog: prerelease.changelog.replace('## 3.4.0', '## 4.0.0-next.2'),
      },
    ],
    300,
  );

  assert.ok(notes.includes('CHANGELOG.md#400-next2)'));
});

/** Each way the one entry of a package is written, from the whole one to the shortest. */
function formsOf(entry) {
  const packages = [pkg('packages/core/ui', entry)];
  const forms = [];
  let notes = notesOf(packages);
  while (!/^1 change\.$/m.test(notes)) {
    forms.push(notes.slice(notes.indexOf('\n- ') + 1).replace(/\n\n\[Full notes\].*$/, ''));
    const next = notesOf(packages, notes.length - 1);
    if (next === notes) break;
    notes = next;
  }
  return forms;
}

test('a shortened entry never ends inside a list, a fence or a table', () => {
  const bodies = {
    list: '  - A part.\n\n    - A part of it.',
    numbers: '  1. A step.\n  2. Another.',
    fence: `  \`\`\`ts\n  const before = 1;\n\n  const after = 2;\n  \`\`\`${' '}`,
    table: '  | A | B |\n  | - | - |\n  | 1 | 2 |',
    quote: '  > A quote.',
  };
  for (const [kind, body] of Object.entries(bodies)) {
    const [, second] = formsOf(
      `- #1 – Two things. They are these:\n${body}\n\n  ${'x'.repeat(200)}`,
    );
    assert.equal(second, '- #1 – Two things. They are these: …', kind);
  }
});

test('a shortened entry never ends inside a code span, emphasis or a link', () => {
  const forms = formsOf(
    `- #1 – Set \`a. B\`, **one. Two** and [c. D](https://example.com/c) (e. F). ${'More. '.repeat(40)}`,
  );

  assert.equal(
    forms.at(-1),
    '- #1 – Set `a. B`, **one. Two** and [c. D](https://example.com/c) (e. F). …',
  );
});

test('a wrapped paragraph is cut at a sentence, not at a line', () => {
  const forms = formsOf(`- #1 – A sentence that\n  wraps here. Another.\n  ${'More. '.repeat(40)}`);

  assert.equal(forms.at(-1), '- #1 – A sentence that wraps here. …');
});

test('an entry that opens with a list keeps its first item', () => {
  const forms = formsOf(`- #1 –\n\n  - The first item. More of it.\n  - ${'Another. '.repeat(40)}`);

  assert.deepEqual(forms.slice(1), [
    '- #1 – The first item. More of it. …',
    '- #1 – The first item. …',
  ]);
});

test('notes far over the limit count the changes of the packages listed last', () => {
  const entry = `- ${'x'.repeat(200)}`;
  const packages = [
    pkg('packages/viewer/main', entry),
    pkg('packages/core/ui', `${entry}\n\n${entry}`),
    pkg('packages/core/text', entry),
  ];
  const notes = notesOf(packages, 600);

  assert.ok(notes.length <= 600);
  assert.match(sectionOf(notes, '@embedpdf/main'), /x{200}$/);
  assert.equal(
    sectionOf(notes, '@embedpdf/ui'),
    [
      '## @embedpdf/ui@3.4.0',
      '2 changes.',
      `[Full notes](${HOME}/blob/v3.4.0/packages/core/ui/CHANGELOG.md#340)`,
    ].join('\n\n'),
  );
});

/** A release of one package whose notes are over both limits. */
function longRelease() {
  const entry = (number) => `- #${number} – A sentence. ${'More about it. '.repeat(20)}`;
  const section = Array.from({ length: 500 }, (_, number) => entry(number)).join('\n\n');
  return { packages: [pkg('packages/core/ui', section)], isEarlier: () => false };
}

async function pullRequestBody(body, release) {
  let written;
  const github = {
    rest: {
      pulls: {
        get: async (params) => {
          assert.deepEqual(params, { ...repository, pull_number: 12 });
          return { data: { body } };
        },
        update: async (params) => {
          assert.equal(params.pull_number, 12);
          written = params.body;
        },
      },
    },
  };
  await writePullRequestNotes({ github, repository, number: 12, release, ref: 'a'.repeat(40) });
  return written;
}

test('the pull request keeps the text above its releases', async () => {
  const release = { packages: [pkg('packages/core/ui', '- #1 – A fix.')] };
  const expected = `${CHANGESETS_TEXT}\n\n# Releases\n\n## @embedpdf/ui@3.4.0\n\n### Minor Changes\n\n- #1 – A fix.`;

  const first = await pullRequestBody(
    `${CHANGESETS_TEXT}\n\n\n# Releases\n\n> The changelog information of each package has been omitted.\n`,
    release,
  );
  assert.equal(first, expected);
  assert.equal(await pullRequestBody(first, release), expected, 'writing it again changes nothing');
  assert.equal(
    await pullRequestBody(`${CHANGESETS_TEXT}\r\n\r\n# Releases\r\n`, release),
    expected,
  );
});

test('the pull request stays under its limit, its text included', async () => {
  const text = CHANGESETS_TEXT.repeat(50);
  const body = await pullRequestBody(`${text}\n\n# Releases\n`, longRelease());

  assert.ok(body.startsWith(text));
  assert.ok(body.length <= PULL_REQUEST_LIMIT);
  assert.ok(body.includes(`/blob/${'a'.repeat(40)}/packages/core/ui/CHANGELOG.md#340`));
});

const GENERATED = '## @embedpdf/ui@3.4.0\n\n### Minor Changes\n\n- #1 – A fix.';

async function notesWith(pull, isEarlier = () => false) {
  const github = {
    graphql: async (query, variables) => {
      assert.match(query, /headRefName: "changeset-release\/main"/);
      assert.deepEqual(variables, repository);
      return { repository: { pullRequests: { nodes: pull ? [pull] : [] } } };
    },
  };
  const release = { packages: [pkg('packages/core/ui', '- #1 – A fix.')], isEarlier };
  return releaseNotes({ github, repository, tag: 'v3.4.0', release });
}

function pullBy(
  type,
  body = `${CHANGESETS_TEXT}\n\n# Releases\n\nWhat a person wrote.\n\n## More\n`,
) {
  return { body, editor: type && { __typename: type }, mergeCommit: { oid: 'b'.repeat(40) } };
}

test('a release has the changelogs of its packages', async () => {
  assert.equal(await notesWith(undefined), GENERATED);
  assert.equal(await notesWith(pullBy('Bot')), GENERATED);
  assert.equal(await notesWith(pullBy(null)), GENERATED, 'a body nobody edited');
});

test('a release has what a person wrote in its version pull request', async () => {
  assert.equal(await notesWith(pullBy('User')), 'What a person wrote.\n\n## More');
  assert.equal(await notesWith(pullBy('User', 'No heading.\n')), 'No heading.');
  assert.equal(await notesWith(pullBy('User', '\n')), GENERATED, 'a body left empty');
});

test('what a person wrote for an earlier release is not used again', async () => {
  const isEarlier = (commit) => commit === 'b'.repeat(40);

  assert.equal(await notesWith(pullBy('User'), isEarlier), GENERATED);
});

test('a release may be longer than a pull request', async () => {
  const github = { graphql: async () => ({ repository: { pullRequests: { nodes: [] } } }) };
  const notes = await releaseNotes({ github, repository, tag: 'v3.4.0', release: longRelease() });

  assert.ok(notes.length > PULL_REQUEST_LIMIT);
  assert.ok(notes.length <= RELEASE_LIMIT);
  assert.ok(notes.includes('/blob/v3.4.0/packages/core/ui/CHANGELOG.md#340'));
});
