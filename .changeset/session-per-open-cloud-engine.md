---
'@cloudpdf/engine': patch
---

Every open document is its own editing session, with its own session id and HTTP client, even when one engine opens the same document twice. Before, an engine's opens shared one session: two opens of one document could be handed the same object numbers, so one of their creates was refused, and each dropped the other's changes as its own echo. Documents opened by id with the engine's token also shared one CDN binding, so all but the last read from the origin. A document opened with its own token now keeps the engine's `docAffinityHeader` and `onRetry`.
