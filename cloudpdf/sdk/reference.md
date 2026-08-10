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
    pon: 1
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
    pon: 1
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

## Shares
<details><summary><code>client.shares.<a href="/src/api/resources/shares/client/Client.ts">exchange</a>({ ...params }) -> CloudPDF.SharesExchange200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Unauthenticated, but requires a browser Origin header, checked against the grant allowlist. Unknown, revoked, and disabled tokens are indistinguishable (404). Passphrase-protected grants return 422 SharePasswordRequired until `password` is supplied. Mounted only when the deployment can sign (HS256 mode).
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
await client.shares.exchange({
    shareToken: "shareToken"
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

**request:** `CloudPDF.SharesExchangeRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `SharesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.shares.<a href="/src/api/resources/shares/client/Client.ts">list</a>({ ...params }) -> core.Page&lt;CloudPDF.SharesList200Response.Shares.Item, CloudPDF.SharesList200Response&gt;</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.shares.list({
    tenantId: "tenantId"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.shares.list({
    tenantId: "tenantId"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

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

**request:** `CloudPDF.ListSharesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `SharesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.shares.<a href="/src/api/resources/shares/client/Client.ts">create</a>({ ...params }) -> CloudPDF.SharesCreate200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The returned share id IS the public share token. Mounted only when the deployment can sign (HS256 mode) — exchange mints session JWTs, so grants exist only where minting does.
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
await client.shares.create({
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

**request:** `CloudPDF.SharesCreateRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `SharesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.shares.<a href="/src/api/resources/shares/client/Client.ts">get</a>({ ...params }) -> CloudPDF.SharesGet200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.shares.get({
    tenantId: "tenantId",
    shareId: "shareId"
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

**request:** `CloudPDF.GetSharesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `SharesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.shares.<a href="/src/api/resources/shares/client/Client.ts">delete</a>({ ...params }) -> void</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.shares.delete({
    tenantId: "tenantId",
    shareId: "shareId"
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

**request:** `CloudPDF.DeleteSharesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `SharesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.shares.<a href="/src/api/resources/shares/client/Client.ts">update</a>({ ...params }) -> CloudPDF.SharesUpdate200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.shares.update({
    tenantId: "tenantId",
    shareId: "shareId"
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

**request:** `CloudPDF.SharesUpdateRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `SharesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Tenants
<details><summary><code>client.tenants.<a href="/src/api/resources/tenants/client/Client.ts">list</a>({ ...params }) -> core.Page&lt;CloudPDF.TenantsList200Response.Tenants.Item, CloudPDF.TenantsList200Response&gt;</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.tenants.list();
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.tenants.list();
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

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

Facts only — no limits or billing state. Views count share exchanges plus authorized /v1/access grants, deduplicated across the two.
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
<details><summary><code>client.documents.<a href="/src/api/resources/documents/client/Client.ts">list</a>({ ...params }) -> core.Page&lt;CloudPDF.DocumentsList200Response.Documents.Item, CloudPDF.DocumentsList200Response&gt;</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.documents.list({
    tenantId: "tenantId"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.documents.list({
    tenantId: "tenantId"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

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

<details><summary><code>client.documents.<a href="/src/api/resources/documents/client/Client.ts">commit</a>({ ...params }) -> CloudPDF.DocumentsCommit200Response</code></summary>
<dl>
<dd>

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

This bounded origin-mediated fallback must only be used after documents.init returns upload.kind=proxy. Auto mode prefers a presigned object-store PUT whenever available.
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

<details><summary><code>client.documents.<a href="/src/api/resources/documents/client/Client.ts">init</a>({ ...params }) -> CloudPDF.DocumentsInit200Response</code></summary>
<dl>
<dd>

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

## Tokens
<details><summary><code>client.tokens.<a href="/src/api/resources/tokens/client/Client.ts">issue</a>({ ...params }) -> CloudPDF.TokensIssue200Response</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

kind "tenant" requires the API token — authority mints only downward. Mounted only when the deployment can sign (HS256 mode); asymmetric deployments mint with their own private key.
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
    pon: 1
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
    pon: 1,
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
    pon: 1,
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
    pon: 1,
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

## Doc Forms
<details><summary><code>client.doc.forms.<a href="/src/api/resources/doc/resources/forms/client/Client.ts">get</a>({ ...params }) -> CloudPDF.DocFormsGet200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.forms.get({
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

**request:** `CloudPDF.doc.GetFormsRequest` 
    
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

<details><summary><code>client.doc.forms.<a href="/src/api/resources/doc/resources/forms/client/Client.ts">exportData</a>({ ...params }) -> core.BinaryResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.forms.exportData({
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

**request:** `CloudPDF.doc.ExportDataFormsRequest` 
    
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

<details><summary><code>client.doc.forms.<a href="/src/api/resources/doc/resources/forms/client/Client.ts">importData</a>({ ...params }) -> CloudPDF.DocFormsImportData200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.forms.importData({
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

**request:** `CloudPDF.doc.ImportDataFormsRequest` 
    
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
    layerName: "layerName",
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

**request:** `CloudPDF.doc.ResetFormsRequest` 
    
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

## Doc Pages
<details><summary><code>client.doc.pages.<a href="/src/api/resources/doc/resources/pages/client/Client.ts">delete</a>({ ...params }) -> CloudPDF.DocPagesDelete200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.pages.delete({
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

**request:** `CloudPDF.doc.DeletePagesRequest` 
    
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

<details><summary><code>client.doc.pages.<a href="/src/api/resources/doc/resources/pages/client/Client.ts">move</a>({ ...params }) -> CloudPDF.DocPagesMove200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.pages.move({
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

**request:** `CloudPDF.doc.MovePagesRequest` 
    
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

<details><summary><code>client.doc.pages.<a href="/src/api/resources/doc/resources/pages/client/Client.ts">rotate</a>({ ...params }) -> CloudPDF.DocPagesRotate200Response</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.doc.pages.rotate({
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

**request:** `CloudPDF.doc.RotatePagesRequest` 
    
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

**request:** `CloudPDF.doc.ApplyRedactionsRequest` 
    
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

