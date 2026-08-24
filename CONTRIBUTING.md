# Contributing to Embed PDF Viewer

Thank you for your interest in contributing to Embed PDF Viewer! This document provides guidelines and steps for contributing.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful and constructive in all interactions.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/embedpdf/embed-pdf-viewer/issues)
2. If not, create a new issue with:
   - A clear, descriptive title
   - Detailed steps to reproduce the bug
   - Expected vs actual behavior
   - Screenshots if applicable
   - Your environment details (browser, OS, etc.)

### Suggesting Enhancements

1. Open a new issue describing your proposed enhancement
2. Include:
   - The use case for the enhancement
   - How it would benefit other users
   - Any implementation details you have in mind

### Pull Requests

1. Fork the repository
2. Create a new branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests if available
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

#### Pull Request Guidelines

- Follow the existing code style
- Include comments in your code where necessary
- Update documentation if needed
- Add tests for new features
- Ensure all tests pass
- Keep pull requests focused on a single feature/fix

## Development Setup

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Watch for changes and build: `pnpm build:watch`
4. Run an example for example the vanilla example: `pnpm dev --filter @embedpdf/example-vanilla`

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE) (inbound = outbound).

The one special case is `cloudpdf/server`, which is distributed under the Fair
Core License (FCL-1.0-ALv2) — see [LICENSING.md](LICENSING.md). By contributing
to `cloudpdf/server` you license your contribution to CloudPDF LTD under
Apache-2.0 and agree that CloudPDF LTD may distribute it as part of the server
under the FCL and under commercial license terms.
