---
'@embedpdf/engine-core': minor
---

The open input for a CloudPDF grant is `{ kind: 'grant', grant, passphrase?,
restart? }` (`OpenInputGrant`), and a document opened with one has `doc.grant`
(`DocumentGrant`), whose `resume()` takes `passphrase`. `ShareOpenRequest` is
`GrantOpenRequest`, with `passphraseProvided`, and `SharePasswordRequired` is
`GrantPassphraseRequired`.
