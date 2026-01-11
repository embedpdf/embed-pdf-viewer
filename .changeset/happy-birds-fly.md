---
'@embedpdf/engines': minor
---

Add document security/encryption engine methods:

- Add `setDocumentEncryption` for setting AES-256 encryption with user/owner passwords and permission flags
- Add `removeEncryption` for marking documents for encryption removal on save
- Add `unlockOwnerPermissions` for unlocking owner permissions on encrypted documents
- Add `isEncrypted` and `isOwnerUnlocked` query methods
- Implement security methods in `PdfEngine` orchestrator, `RemoteExecutor`, `PdfiumNative`, `WebWorkerEngine`, and `EngineRunner`
- Query and store `isEncrypted`, `isOwnerUnlocked`, and `permissions` when opening documents
