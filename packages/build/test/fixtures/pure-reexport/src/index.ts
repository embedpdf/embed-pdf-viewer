// Pure re-export from an external (non-workspace) package — exactly the shape
// that triggered #27. The choice of `tslib` is incidental: any external module
// works, and it avoids workspace-build ordering issues for the test.
export * from 'tslib';
