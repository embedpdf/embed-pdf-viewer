// Static export so the runner can serve it like any other build output.
// Lint is the monorepo's concern, not this probe's.
export default { output: 'export', eslint: { ignoreDuringBuilds: true } };
