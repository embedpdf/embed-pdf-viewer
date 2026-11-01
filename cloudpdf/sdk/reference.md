# Reference
## Deployment
<details><summary><code>client.deployment.<a href="/src/api/resources/deployment/client/Client.ts">licenseStatus</a>() -> CloudPDF.DeploymentLicenseStatusResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.deployment.licenseStatus();

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**requestOptions:** `DeploymentClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Doc
<details><summary><code>client.doc.<a href="/src/api/resources/doc/client/Client.ts">head</a>({ ...params }) -> CloudPDF.DocHead200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.head({
    docId: "docId"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.HeadDocRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `DocClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.<a href="/src/api/resources/doc/client/Client.ts">changes</a>({ ...params }) -> CloudPDF.DocChanges200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Each change stands on its own and names itself by `opId`: a refused change rolls back alone, and the answer lists every change in order, applied with its result or refused with its error. Asked again under its `opId`, a change gets the same answer, refusals included; a different change under an answered `opId` is refused (IdempotencyKeyReused). `{ opId, undoOf }` undoes an earlier change of the caller, here or in an earlier request; an undo leaves alone what was changed since, and the undo of an undo redoes. A redaction, a flatten, a form repair or a completed signature ends undo for the changes before it (UndoUnavailable). Each op is checked against its own capability: annotation ops need `doc.annotate.modify`, form values `doc.forms.fill`, form structure `doc.forms.modify`, metadata `doc.metadata.modify`, outline `doc.outline.modify`, pages `doc.pages.assemble`, embedded files `doc.attachments.modify`. Bytes (a stamp's drawing, an attached file, a signature's artwork, a PDF whose pages come in) travel as multipart: a JSON `body` part, each op naming its files by role as `resources: { <role>: '<key>' }`, and each file as the part `resource:<key>`. At most 64 changes per request and 512 ops per change.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.changes({
    docId: "docId",
    layerName: "layerName",
    changes: [{
            opId: "opId"
        }]
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.DocChangesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `DocClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.<a href="/src/api/resources/doc/client/Client.ts">download</a>({ ...params }) -> core.BinaryResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.download({
    docId: "docId",
    layerName: "layerName"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.DownloadDocRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `DocClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.<a href="/src/api/resources/doc/client/Client.ts">downloadLink</a>({ ...params }) -> CloudPDF.DocDownloadLink200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The link opens the layer as it is when created: once the layer changes, it answers 404, so create it right before handing it over. It downloads that one file and nothing else, and a password-protected document is checked when the link is created. Deployments that verify tokens with their own keys (JWKS) mint links on their backend: a doc token with `layer_name`, a `download: { docVersion, mode: "incremental" }` claim and a short `exp`, passed as `link` on the versioned download URL.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.downloadLink({
    docId: "docId",
    layerName: "layerName"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.DocDownloadLinkRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `DocClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.<a href="/src/api/resources/doc/client/Client.ts">manifest</a>({ ...params }) -> CloudPDF.DocManifest200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.manifest({
    docId: "docId",
    layerName: "layerName"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.ManifestDocRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `DocClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.<a href="/src/api/resources/doc/client/Client.ts">render</a>({ ...params }) -> core.BinaryResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Render parameters (viewport, format) pass as flat dotted query keys, e.g. `?viewport.kind=width&viewport.width=800`; the full grammar is documented with the viewer.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.render({
    docId: "docId",
    layerName: "layerName",
    pageKey: "pageKey"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.RenderDocRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `DocClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.<a href="/src/api/resources/doc/client/Client.ts">text</a>({ ...params }) -> CloudPDF.DocText200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.text({
    docId: "docId",
    layerName: "layerName",
    pageKey: "pageKey"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.TextDocRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `DocClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Grants
<details><summary><code>client.grants.<a href="/src/api/resources/grants/client/Client.ts">exchange</a>({ ...params }) -> CloudPDF.GrantsExchange200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Unauthenticated, but requires a browser Origin header, checked against the grant allowlist. Unknown, deleted, paused and archived grants are indistinguishable (404). Passphrase-protected grants return 422 GrantPassphraseRequired until `passphrase` is supplied. A grant that asks its visitors who they are on open returns 422 VisitorIdentityRequired until the required answers are given; `error.details` carries `fields` (what the grant asks), `missing`, `invalid`, `purpose` and `privacyUrl`. A grant that asks before the first change issues the session at once with `visitor.identityRequest`, and writes answer 403 VisitorIdentityRequired with the same details until the visitor exchanges again with their answers. Answers that can not be taken answer 422 on any grant. Mounted only when the deployment can sign (HS256 mode).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.grants.exchange({
    grant: "grant"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.GrantsExchangeRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `GrantsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.grants.<a href="/src/api/resources/grants/client/Client.ts">list</a>({ ...params }) -> CloudPDF.GrantsList200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.grants.list({
    tenantId: "tenantId"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.ListGrantsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `GrantsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.grants.<a href="/src/api/resources/grants/client/Client.ts">create</a>({ ...params }) -> CloudPDF.GrantsCreate200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The returned id is what a link page or an embed opens. Its scope gives only document permissions the caller holds itself, as tokens.issue does. Mounted only when the deployment can sign (HS256 mode) — exchange mints session JWTs, so grants exist only where minting does.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.grants.create({
    tenantId: "tenantId",
    docId: "docId",
    scope: ["scope"]
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.GrantsCreateRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `GrantsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.grants.<a href="/src/api/resources/grants/client/Client.ts">get</a>({ ...params }) -> CloudPDF.GrantsGet200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.grants.get({
    tenantId: "tenantId",
    grantId: "grantId"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.GetGrantsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `GrantsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.grants.<a href="/src/api/resources/grants/client/Client.ts">delete</a>({ ...params }) -> void</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.grants.delete({
    tenantId: "tenantId",
    grantId: "grantId"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.DeleteGrantsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `GrantsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.grants.<a href="/src/api/resources/grants/client/Client.ts">update</a>({ ...params }) -> CloudPDF.GrantsUpdate200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.grants.update({
    tenantId: "tenantId",
    grantId: "grantId"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.GrantsUpdateRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `GrantsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.grants.<a href="/src/api/resources/grants/client/Client.ts">archive</a>({ ...params }) -> CloudPDF.GrantsArchive200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Archiving is final: an archived grant never exchanges again, and to give access again you create a new grant. Pausing (`disabled`) is the reversible stop. An archived grant no longer counts as using its shared layer, so that layer can be deleted.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.grants.archive({
    tenantId: "tenantId",
    grantId: "grantId"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.ArchiveGrantsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `GrantsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Tenants
<details><summary><code>client.tenants.<a href="/src/api/resources/tenants/client/Client.ts">list</a>({ ...params }) -> CloudPDF.TenantsList200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.tenants.list();

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.ListTenantsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TenantsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.tenants.<a href="/src/api/resources/tenants/client/Client.ts">create</a>({ ...params }) -> CloudPDF.TenantsCreate200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.tenants.create({
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.TenantsCreateRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TenantsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.tenants.<a href="/src/api/resources/tenants/client/Client.ts">get</a>({ ...params }) -> CloudPDF.TenantsGet200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.tenants.get({
    tenantId: "tenantId"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.GetTenantsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TenantsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.tenants.<a href="/src/api/resources/tenants/client/Client.ts">delete</a>({ ...params }) -> void</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Destroys the tenant and everything in its namespace — documents, layers, stored bytes, audit history. Irreversible.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.tenants.delete({
    tenantId: "tenantId"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.DeleteTenantsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TenantsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.tenants.<a href="/src/api/resources/tenants/client/Client.ts">resume</a>({ ...params }) -> void</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.tenants.resume({
    tenantId: "tenantId"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.ResumeTenantsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TenantsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.tenants.<a href="/src/api/resources/tenants/client/Client.ts">suspend</a>({ ...params }) -> void</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Instantly reversible with resume. The API token is exempt, so a suspended tenant can still be inspected, exported, resumed, or deleted.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.tenants.suspend({
    tenantId: "tenantId"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.TenantsSuspendRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TenantsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.tenants.<a href="/src/api/resources/tenants/client/Client.ts">usage</a>({ ...params }) -> CloudPDF.TenantsUsage200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Facts only — no limits or billing state. Views count grant exchanges plus authorized /v1/access requests, deduplicated across the two.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.tenants.usage({
    tenantId: "tenantId"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.UsageTenantsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TenantsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Documents
<details><summary><code>client.documents.<a href="/src/api/resources/documents/client/Client.ts">list</a>({ ...params }) -> CloudPDF.DocumentsList200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.documents.list({
    tenantId: "tenantId"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.ListDocumentsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `DocumentsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.documents.<a href="/src/api/resources/documents/client/Client.ts">get</a>({ ...params }) -> CloudPDF.DocumentsGet200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.documents.get({
    tenantId: "tenantId",
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.GetDocumentsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `DocumentsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.documents.<a href="/src/api/resources/documents/client/Client.ts">delete</a>({ ...params }) -> void</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.documents.delete({
    tenantId: "tenantId",
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.DeleteDocumentsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `DocumentsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.documents.<a href="/src/api/resources/documents/client/Client.ts">update</a>({ ...params }) -> CloudPDF.DocumentsUpdate200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A document that is being deleted answers 404.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.documents.update({
    tenantId: "tenantId",
    id: "id",
    name: "name"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.DocumentsUpdateRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `DocumentsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.documents.<a href="/src/api/resources/documents/client/Client.ts">commit</a>({ ...params }) -> CloudPDF.DocumentsCommit200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

An upload token commits only the documents it started; any other document answers 404.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.documents.commit({
    tenantId: "tenantId",
    id: "id",
    sha256: "sha256"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.DocumentsCommitRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `DocumentsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.documents.<a href="/src/api/resources/documents/client/Client.ts">download</a>({ ...params }) -> core.BinaryResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.documents.download({
    tenantId: "tenantId",
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.DownloadDocumentsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `DocumentsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.documents.<a href="/src/api/resources/documents/client/Client.ts">thumbnail</a>({ ...params }) -> core.BinaryResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.documents.thumbnail({
    tenantId: "tenantId",
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.ThumbnailDocumentsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `DocumentsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.documents.<a href="/src/api/resources/documents/client/Client.ts">uploadProxy</a>({ ...params }) -> CloudPDF.DocumentsUploadProxy200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

This bounded origin-mediated fallback must only be used after documents.init returns upload.kind=proxy. Auto mode prefers a presigned object-store PUT whenever available. An upload token sends files only to the documents it started.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.documents.uploadProxy({
    file: fs.createReadStream("/path/to/your/file"),
    tenantId: "tenantId",
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.UploadProxyDocumentsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `DocumentsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.documents.<a href="/src/api/resources/documents/client/Client.ts">importFrom</a>({ ...params }) -> CloudPDF.DocumentsImportFrom200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Default mode is synchronous and bounded: the response returns only after the transfer verified and committed (or failed). mode=async (connection sources only) answers 202 immediately and an in-process worker performs the transfer with leased, fenced retries; poll the document until ready/failed. The deployment import policy gates scheme, network range, and size; sources must declare a length. CloudPDF copies and owns the bytes — the source is never referenced in place. A 502 marks a retryable upstream failure: retry with the same idempotencyKey to resume the same document. URL sources are capabilities and never echoed back. Connection sources name operator-registered storage (bucket/prefix scope, allowed credential classes, and tenant bindings are deployment configuration); `revision` is provider-interpreted (S3 VersionId, GCS generation, Azure version id).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.documents.importFrom({
    tenantId: "tenantId",
    source: {
        kind: "url",
        url: "url"
    }
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.DocumentsImportFromRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `DocumentsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.documents.<a href="/src/api/resources/documents/client/Client.ts">init</a>({ ...params }) -> CloudPDF.DocumentsInit200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

With an upload token, the document goes into the token's folder with the token's metadata, whatever the request says; contentLength must be within the token's maxBytes, and the token makes at most maxFiles documents (403 after). docId, idempotencyKey and dedupMode reuse-existing are refused (400): each could reach a document the token didn't make.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.documents.init({
    tenantId: "tenantId",
    contentLength: 1.1,
    contentSha256: "contentSha256"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.DocumentsInitRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `DocumentsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Folders
<details><summary><code>client.folders.<a href="/src/api/resources/folders/client/Client.ts">list</a>({ ...params }) -> CloudPDF.FoldersList200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.folders.list({
    tenantId: "tenantId"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.ListFoldersRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `FoldersClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.folders.<a href="/src/api/resources/folders/client/Client.ts">create</a>({ ...params }) -> CloudPDF.FoldersCreate200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

409 Conflict carries `details.reason`: `name-taken` (a sibling has the name, ignoring case; `details.name`) or `too-deep` (folders nest at most 100 levels; `details.maxDepth`). 404 when the parent folder does not exist.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.folders.create({
    tenantId: "tenantId",
    name: "name"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.FoldersCreateRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `FoldersClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.folders.<a href="/src/api/resources/folders/client/Client.ts">get</a>({ ...params }) -> CloudPDF.FoldersGet200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.folders.get({
    tenantId: "tenantId",
    folderId: "folderId"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.GetFoldersRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `FoldersClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.folders.<a href="/src/api/resources/folders/client/Client.ts">delete</a>({ ...params }) -> void</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Without recursive, a folder with anything inside is refused: 409 Conflict with `details.reason` `not-empty` and what it holds, counted over every level below, in `details.folders` and `details.documents`. With recursive=true, the folder and every folder under it go at once, and every document in them stops opening, leaves every list and stops answering its grants at once; their stored files and grants are removed in the background. Uploads into those folders that have not committed cannot commit.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.folders.delete({
    tenantId: "tenantId",
    folderId: "folderId"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.DeleteFoldersRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `FoldersClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.folders.<a href="/src/api/resources/folders/client/Client.ts">update</a>({ ...params }) -> CloudPDF.FoldersUpdate200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

409 Conflict with `details.reason` `name-taken` when a sibling has the name, ignoring case.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.folders.update({
    tenantId: "tenantId",
    folderId: "folderId",
    name: "name"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.FoldersUpdateRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `FoldersClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.folders.<a href="/src/api/resources/folders/client/Client.ts">moveInto</a>({ ...params }) -> void</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Up to 1,000 ids in total. A folder moves with everything in it. 404 NotFound names the ids that do not exist or are being deleted in `details.documentIds` and `details.folderIds`. 409 Conflict carries `details.reason`: `cycle` (the destination is a moved folder or inside one; `details.folderId`), `too-deep` (the move would nest folders deeper than 100 levels; `details.maxDepth`) or `name-taken` (a moved folder's name is taken in the destination, ignoring case; `details.name`).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.folders.moveInto({
    tenantId: "tenantId",
    folderId: "folderId"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.FoldersMoveIntoRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `FoldersClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Tokens
<details><summary><code>client.tokens.<a href="/src/api/resources/tokens/client/Client.ts">issue</a>({ ...params }) -> CloudPDF.TokensIssue200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Authority mints only downward: kind "doc" gives only document permissions the caller holds itself, kind "tenant" requires the API token, and kind "upload" requires docs.create instead of tokens.issue-doc, since an upload token can do only what docs.create allows. Mounted only when the deployment can sign (HS256 mode); asymmetric deployments mint with their own private key.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.tokens.issue({
    tenantId: "tenantId",
    body: {
        kind: "doc",
        sub: "sub",
        docId: "docId",
        scope: ["scope"],
        expiresIn: 1
    }
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.IssueTokensRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TokensClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.tokens.<a href="/src/api/resources/tokens/client/Client.ts">revoke</a>({ ...params }) -> void</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Mounted only when the deployment enables token revocation.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.tokens.revoke({
    tenantId: "tenantId",
    jti: "jti"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.TokensRevokeRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TokensClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Doc Annotations
<details><summary><code>client.doc.annotations.<a href="/src/api/resources/doc/resources/annotations/client/Client.ts">listAll</a>({ ...params }) -> CloudPDF.DocAnnotationsListAll200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns one entry per page plus the audit-log cursor for reconciling subsequent document events. Page order is unspecified; join by `page` (a `PageRef`) when display order matters.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.annotations.listAll({
    docId: "docId",
    layerName: "layerName"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.ListAllAnnotationsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `AnnotationsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.annotations.<a href="/src/api/resources/doc/resources/annotations/client/Client.ts">list</a>({ ...params }) -> CloudPDF.DocAnnotationsList200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.annotations.list({
    docId: "docId",
    layerName: "layerName",
    pageKey: "pageKey"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.ListAnnotationsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `AnnotationsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.annotations.<a href="/src/api/resources/doc/resources/annotations/client/Client.ts">create</a>({ ...params }) -> CloudPDF.DocAnnotationsCreate200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Doc JWTs may instead carry collab scopes (annotations:create:self, …) that refine per-annotation authorship rules; the API token is exempt from both.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.annotations.create({
    docId: "docId",
    layerName: "layerName",
    pageKey: "pageKey",
    body: {
        "key": "value"
    }
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.CreateAnnotationsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `AnnotationsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.annotations.<a href="/src/api/resources/doc/resources/annotations/client/Client.ts">delete</a>({ ...params }) -> CloudPDF.DocAnnotationsDelete200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.annotations.delete({
    docId: "docId",
    layerName: "layerName",
    pageKey: "pageKey",
    annotKey: "annotKey"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.DeleteAnnotationsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `AnnotationsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.annotations.<a href="/src/api/resources/doc/resources/annotations/client/Client.ts">update</a>({ ...params }) -> CloudPDF.DocAnnotationsUpdate200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.annotations.update({
    docId: "docId",
    layerName: "layerName",
    pageKey: "pageKey",
    annotKey: "annotKey",
    body: {
        "key": "value"
    }
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.UpdateAnnotationsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `AnnotationsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.annotations.<a href="/src/api/resources/doc/resources/annotations/client/Client.ts">readAppearance</a>({ ...params }) -> core.BinaryResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.annotations.readAppearance({
    docId: "docId",
    layerName: "layerName",
    pageKey: "pageKey",
    annotKey: "annotKey"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.ReadAppearanceAnnotationsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `AnnotationsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.annotations.<a href="/src/api/resources/doc/resources/annotations/client/Client.ts">readFile</a>({ ...params }) -> core.BinaryResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A file that decodes past the server's limit is refused (PayloadTooLarge).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.annotations.readFile({
    docId: "docId",
    layerName: "layerName",
    pageKey: "pageKey",
    annotKey: "annotKey"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.ReadFileAnnotationsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `AnnotationsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.annotations.<a href="/src/api/resources/doc/resources/annotations/client/Client.ts">exportAppearance</a>({ ...params }) -> core.BinaryResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.annotations.exportAppearance({
    docId: "docId",
    layerName: "layerName",
    pageKey: "pageKey",
    body: {
        "string": {
            "key": "value"
        }
    }
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.ExportAppearanceAnnotationsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `AnnotationsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.annotations.<a href="/src/api/resources/doc/resources/annotations/client/Client.ts">flatten</a>({ ...params }) -> CloudPDF.DocAnnotationsFlatten200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.annotations.flatten({
    docId: "docId",
    layerName: "layerName",
    pageKey: "pageKey",
    body: {
        "key": "value"
    }
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.FlattenAnnotationsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `AnnotationsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.annotations.<a href="/src/api/resources/doc/resources/annotations/client/Client.ts">reorder</a>({ ...params }) -> CloudPDF.DocAnnotationsReorder200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.annotations.reorder({
    docId: "docId",
    layerName: "layerName",
    pageKey: "pageKey",
    refs: [{
            kind: "objectNumber",
            page: {
                kind: "objectNumber",
                objectNumber: 1
            },
            objectNumber: 1
        }],
    position: "start"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.DocAnnotationsReorderRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `AnnotationsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Doc Attachments
<details><summary><code>client.doc.attachments.<a href="/src/api/resources/doc/resources/attachments/client/Client.ts">download</a>({ ...params }) -> core.BinaryResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A file that decodes past the server's limit is refused (PayloadTooLarge).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.attachments.download({
    docId: "docId",
    layerName: "layerName",
    fileKey: "fileKey"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.DownloadAttachmentsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `AttachmentsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.attachments.<a href="/src/api/resources/doc/resources/attachments/client/Client.ts">list</a>({ ...params }) -> CloudPDF.DocAttachmentsList200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A file-attachment annotation's file is listed with the annotation; read its bytes with `doc.annotations.readFile`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.attachments.list({
    docId: "docId",
    layerName: "layerName"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.ListAttachmentsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `AttachmentsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Doc Forms
<details><summary><code>client.doc.forms.<a href="/src/api/resources/doc/resources/forms/client/Client.ts">list</a>({ ...params }) -> CloudPDF.DocFormsList200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.forms.list({
    docId: "docId",
    layerName: "layerName"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.ListFormsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `FormsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.forms.<a href="/src/api/resources/doc/resources/forms/client/Client.ts">reorderCalculations</a>({ ...params }) -> CloudPDF.DocFormsReorderCalculations200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.forms.reorderCalculations({
    docId: "docId",
    layerName: "layerName",
    fields: [{
            kind: "objectNumber",
            objectNumber: 1
        }],
    position: "start"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.DocFormsReorderCalculationsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `FormsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.forms.<a href="/src/api/resources/doc/resources/forms/client/Client.ts">setValue</a>({ ...params }) -> CloudPDF.DocFormsSetValue200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.forms.setValue({
    docId: "docId",
    layerName: "layerName",
    fieldKey: "fieldKey",
    body: {
        "key": "value"
    }
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.SetValueFormsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `FormsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.forms.<a href="/src/api/resources/doc/resources/forms/client/Client.ts">reset</a>({ ...params }) -> CloudPDF.DocFormsReset200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.forms.reset({
    docId: "docId",
    layerName: "layerName"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.DocFormsResetRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `FormsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.forms.<a href="/src/api/resources/doc/resources/forms/client/Client.ts">deleteWidget</a>({ ...params }) -> CloudPDF.DocFormsDeleteWidget200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.forms.deleteWidget({
    docId: "docId",
    layerName: "layerName",
    pageKey: "pageKey",
    annotKey: "annotKey"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.DeleteWidgetFormsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `FormsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.forms.<a href="/src/api/resources/doc/resources/forms/client/Client.ts">updateWidget</a>({ ...params }) -> CloudPDF.DocFormsUpdateWidget200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.forms.updateWidget({
    docId: "docId",
    layerName: "layerName",
    pageKey: "pageKey",
    annotKey: "annotKey",
    patch: {}
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.DocFormsUpdateWidgetRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `FormsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.forms.<a href="/src/api/resources/doc/resources/forms/client/Client.ts">reorderWidgets</a>({ ...params }) -> CloudPDF.DocFormsReorderWidgets200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.forms.reorderWidgets({
    docId: "docId",
    layerName: "layerName",
    pageKey: "pageKey",
    widgets: [{
            kind: "objectNumber",
            page: {
                kind: "objectNumber",
                objectNumber: 1
            },
            objectNumber: 1
        }],
    position: "start"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.DocFormsReorderWidgetsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `FormsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Doc Metadata
<details><summary><code>client.doc.metadata.<a href="/src/api/resources/doc/resources/metadata/client/Client.ts">get</a>({ ...params }) -> CloudPDF.DocMetadataGet200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.metadata.get({
    docId: "docId",
    layerName: "layerName"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.GetMetadataRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MetadataClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Doc Outline
<details><summary><code>client.doc.outline.<a href="/src/api/resources/doc/resources/outline/client/Client.ts">get</a>({ ...params }) -> CloudPDF.DocOutlineGet200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.outline.get({
    docId: "docId",
    layerName: "layerName"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.GetOutlineRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `OutlineClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Doc Pages
<details><summary><code>client.doc.pages.<a href="/src/api/resources/doc/resources/pages/client/Client.ts">setScale</a>({ ...params }) -> CloudPDF.DocPagesSetScale200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.pages.setScale({
    docId: "docId",
    layerName: "layerName",
    pageKey: "pageKey"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.DocPagesSetScaleRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `PagesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.pages.<a href="/src/api/resources/doc/resources/pages/client/Client.ts">viewports</a>({ ...params }) -> CloudPDF.DocPagesViewports200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.pages.viewports({
    docId: "docId",
    layerName: "layerName",
    pageKey: "pageKey"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.ViewportsPagesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `PagesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.pages.<a href="/src/api/resources/doc/resources/pages/client/Client.ts">extract</a>({ ...params }) -> core.BinaryResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A read, not a mutation: the source document is untouched and no event is published. Body is `{"pages": PageRef[], "flatten"?: {"usage"?: "display" | "print"}, "includeAnnotations"?: boolean, "includeFormFields"?: boolean}`; the response body is the new PDF. With `flatten` the copy is the pages as they draw for `usage` (`"print"`: a print copy): the annotations and form fields painted in, nothing interactive left, layers in their state for the usage. A flattened copy takes `doc.download` or `doc.download.flattened`, and paints only what the caller may read; `includeAnnotations` and `includeFormFields` choose what it paints, and are refused without `flatten`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.pages.extract({
    docId: "docId",
    layerName: "layerName",
    body: {
        "string": {
            "key": "value"
        }
    }
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.ExtractPagesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `PagesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.pages.<a href="/src/api/resources/doc/resources/pages/client/Client.ts">flatten</a>({ ...params }) -> CloudPDF.DocPagesFlatten200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.pages.flatten({
    docId: "docId",
    layerName: "layerName",
    body: {
        "key": "value"
    }
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.FlattenPagesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `PagesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.pages.<a href="/src/api/resources/doc/resources/pages/client/Client.ts">setName</a>({ ...params }) -> CloudPDF.DocPagesSetName200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.pages.setName({
    docId: "docId",
    layerName: "layerName",
    body: {
        "key": "value"
    }
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.SetNamePagesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `PagesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.pages.<a href="/src/api/resources/doc/resources/pages/client/Client.ts">removeName</a>({ ...params }) -> CloudPDF.DocPagesRemoveName200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.pages.removeName({
    docId: "docId",
    layerName: "layerName",
    body: {
        "key": "value"
    }
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.RemoveNamePagesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `PagesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Doc Redactions
<details><summary><code>client.doc.redactions.<a href="/src/api/resources/doc/resources/redactions/client/Client.ts">apply</a>({ ...params }) -> CloudPDF.DocRedactionsApply200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.redactions.apply({
    docId: "docId",
    layerName: "layerName"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.DocRedactionsApplyRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RedactionsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Doc Signatures
<details><summary><code>client.doc.signatures.<a href="/src/api/resources/doc/resources/signatures/client/Client.ts">list</a>({ ...params }) -> CloudPDF.DocSignaturesList200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Describes the bytes the layer is over: the base version's signatures plus the layer's own edits as the last revision. Signed bytes (contents, digests, revision prefixes) are served per base version under /versions.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.signatures.list({
    docId: "docId",
    layerName: "layerName"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.ListSignaturesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `SignaturesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.signatures.<a href="/src/api/resources/doc/resources/signatures/client/Client.ts">cancel</a>({ ...params }) -> CloudPDF.DocSignaturesCancel200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.signatures.cancel({
    docId: "docId",
    layerName: "layerName",
    signingId: "signingId"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.CancelSignaturesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `SignaturesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.signatures.<a href="/src/api/resources/doc/resources/signatures/client/Client.ts">complete</a>({ ...params }) -> CloudPDF.DocSignaturesComplete200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

`cms` is the detached CMS over the prepared digest, base64. `expectedVersion` must be what prepare returned. Idempotent by signing id: the same CMS again answers `already-completed`. The new version is the layer's own: only this layer moves to it, and the document and every other layer stay as they were. Refetch the manifest after a completion.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.signatures.complete({
    docId: "docId",
    layerName: "layerName",
    signingId: "signingId",
    cms: "cms",
    expectedVersion: {
        baseSha256: "baseSha256",
        editsVersion: 1
    }
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.DocSignaturesCompleteRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `SignaturesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.signatures.<a href="/src/api/resources/doc/resources/signatures/client/Client.ts">analysis</a>({ ...params }) -> CloudPDF.DocSignaturesAnalysis200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Exactly one of `since.signature=<index>` or `since.revision=<index>`; the layer's pending edits are the end. `level=fill|annotate|lta|none` evaluates exploratorily and never becomes a verdict. For history between two base revisions use the version analysis.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.signatures.analysis({
    docId: "docId",
    layerName: "layerName"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.AnalysisSignaturesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `SignaturesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.signatures.<a href="/src/api/resources/doc/resources/signatures/client/Client.ts">prepare</a>({ ...params }) -> CloudPDF.DocSignaturesPrepare200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Multipart: a JSON `body` part (field, subFilter, digest, contentsSize, signer, certify, lock), naming the appearance PDF it may carry as `resources: { appearance: '<key>' }`, and that PDF as the part `resource:<key>`. A certification (`certify.permission`) additionally requires `doc.sign.certify`. The layer is read-only until the signing completes, is cancelled, or expires (15 minutes). The signature is made over the layer's own base: the upload, or the version its last signature made.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.signatures.prepare({
    file: fs.createReadStream("/path/to/your/file"),
    docId: "docId",
    layerName: "layerName"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.PrepareSignaturesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `SignaturesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Doc Versions
<details><summary><code>client.doc.versions.<a href="/src/api/resources/doc/resources/versions/client/Client.ts">list</a>({ ...params }) -> CloudPDF.DocVersionsList200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Every completed signature makes a new version of its layer; another layer's versions are never listed. Never cached: the list grows.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.versions.list({
    docId: "docId",
    layerName: "layerName"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.ListVersionsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `VersionsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.versions.<a href="/src/api/resources/doc/resources/versions/client/Client.ts">analysis</a>({ ...params }) -> CloudPDF.DocVersionsAnalysis200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Exactly one of `since.signature` / `since.revision`; `until=<revision>` defaults to the last. The same answer for every caller.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.versions.analysis({
    docId: "docId",
    layerName: "layerName",
    sha: "sha"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.AnalysisVersionsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `VersionsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.versions.<a href="/src/api/resources/doc/resources/versions/client/Client.ts">download</a>({ ...params }) -> core.BinaryResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.versions.download({
    docId: "docId",
    layerName: "layerName",
    sha: "sha"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.DownloadVersionsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `VersionsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.versions.<a href="/src/api/resources/doc/resources/versions/client/Client.ts">revision</a>({ ...params }) -> core.BinaryResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.versions.revision({
    docId: "docId",
    layerName: "layerName",
    sha: "sha",
    index: 1
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.RevisionVersionsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `VersionsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.versions.<a href="/src/api/resources/doc/resources/versions/client/Client.ts">signatures</a>({ ...params }) -> CloudPDF.DocVersionsSignatures200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.versions.signatures({
    docId: "docId",
    layerName: "layerName",
    sha: "sha"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.SignaturesVersionsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `VersionsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.versions.<a href="/src/api/resources/doc/resources/versions/client/Client.ts">signatureContents</a>({ ...params }) -> core.BinaryResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

`fieldKey` is the field's fully qualified name, token-text encoded (the same encoding attachment keys use).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.versions.signatureContents({
    docId: "docId",
    layerName: "layerName",
    sha: "sha",
    fieldKey: "fieldKey"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.SignatureContentsVersionsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `VersionsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.doc.versions.<a href="/src/api/resources/doc/resources/versions/client/Client.ts">signatureDigest</a>({ ...params }) -> core.BinaryResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

What a CMS verifier compares its message digest to.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.versions.signatureDigest({
    docId: "docId",
    layerName: "layerName",
    sha: "sha",
    fieldKey: "fieldKey",
    algorithm: "sha1"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.SignatureDigestVersionsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `VersionsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Doc Metadata Custom
<details><summary><code>client.doc.metadata.custom.<a href="/src/api/resources/doc/resources/metadata/resources/custom/client/Client.ts">get</a>({ ...params }) -> CloudPDF.DocMetadataCustomGet200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.metadata.custom.get({
    docId: "docId",
    layerName: "layerName"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.doc.metadata.GetCustomRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `CustomClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Documents Layers
<details><summary><code>client.documents.layers.<a href="/src/api/resources/documents/resources/layers/client/Client.ts">list</a>({ ...params }) -> CloudPDF.DocumentsLayersList200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.documents.layers.list({
    tenantId: "tenantId",
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.documents.ListLayersRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `LayersClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.documents.layers.<a href="/src/api/resources/documents/resources/layers/client/Client.ts">delete</a>({ ...params }) -> void</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.documents.layers.delete({
    tenantId: "tenantId",
    id: "id",
    layerName: "layerName"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.documents.DeleteLayersRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `LayersClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Grants Visitors
<details><summary><code>client.grants.visitors.<a href="/src/api/resources/grants/resources/visitors/client/Client.ts">list</a>({ ...params }) -> CloudPDF.GrantsVisitorsList200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

An archived grant's visitors are listed too.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.grants.visitors.list({
    tenantId: "tenantId",
    grantId: "grantId"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.grants.ListVisitorsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `VisitorsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.grants.visitors.<a href="/src/api/resources/grants/resources/visitors/client/Client.ts">delete</a>({ ...params }) -> void</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Their handle brings them back as a new visitor, who is asked again. Deleting a visitor already deleted changes nothing.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.grants.visitors.delete({
    tenantId: "tenantId",
    grantId: "grantId",
    visitorId: "visitorId"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CloudPDF.grants.DeleteVisitorsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `VisitorsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

