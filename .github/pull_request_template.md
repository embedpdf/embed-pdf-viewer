## What and why

<!-- What changes for a user or a developer, and why. -->

## Checklist

- [ ] Follows the conventions in [`docs/conventions/`](../docs/conventions/README.md): plugin shape, state and sync, events, naming.
- [ ] Tests are added or updated at the layer that owns the behavior (a pure core, a mirror fold, a controller, an adapter).
- [ ] Comments stand on their own: no references to plans, decisions, reviews, chats or tickets, and no history (`pnpm check:comments`).
- [ ] One changeset per directly affected package (`pnpm changeset`).
- [ ] A public API change regenerates the snapshot (`pnpm api:snapshot`).
