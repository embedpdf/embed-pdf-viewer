import { createCloudEngine } from '@cloudpdf/engine';
import type {
  AnnotationAppearanceImagesResult,
  AnnotationDraft,
  AnnotationListPageSnapshot,
  AnnotationRef,
  CdnAccessInfo,
  DocumentHandle,
  DocumentMetadata,
  DocumentMetadataTrapped,
  MetadataPatch,
  PageGeometrySnapshot,
  PageImageHandle,
  PageListSnapshot,
  PageObjectNumber,
  PdfSaveMode,
  WeakAnnotationEditSession,
} from '@embedpdf/engine-core/runtime';
import { applyCdnAccess, wirePaths, type DocResourceId } from '@embedpdf/engine-core/wire';
import './styles.css';

interface AppConfig {
  tenantId: string;
  engineBaseUrl: string;
  originBaseUrl: string;
  dataRoot: string;
  cdn: { kind: string; info: Record<string, unknown> };
}

interface AccessResponse {
  cdn: CdnAccessInfo;
  scope: string[];
  effectiveScope: string[];
  expiresAt: number;
  passwordGrant: string | null;
  pdfPermissions: unknown;
  security: unknown;
}

const PREVIEW_RESOURCES: ReadonlyArray<{ id: DocResourceId; label: string }> = [
  { id: 'head', label: 'head (origin-only)' },
  { id: 'manifest', label: 'manifest@docVersion (doc-level)' },
  {
    id: 'layer-manifest',
    label: 'layers/L/manifest@docVersion (layer-level — what the SDK calls)',
  },
  { id: 'page-render', label: 'render/pages/N/data (doc-level)' },
  {
    id: 'layer-page-render',
    label: 'layers/L/render/pages/N/data (layer-level — what the SDK calls)',
  },
  { id: 'page-text', label: 'text/pages/N/data (doc-level)' },
  { id: 'layer-page-text', label: 'layers/L/text/pages/N/data (layer-level — what the SDK calls)' },
  { id: 'page-geometry', label: 'geometry/pages/N/data (doc-level)' },
  {
    id: 'layer-page-geometry',
    label: 'layers/L/geometry/pages/N/data (layer-level — what the SDK calls)',
  },
  { id: 'annotations-read', label: 'annotations/pages/N/items@annotationVersion' },
  { id: 'layer-metadata', label: 'layers/L/metadata@metadataVersion (layer-level)' },
  { id: 'layer-actions', label: 'layers/L/actions@actionsVersion (layer-level)' },
  { id: 'download-current', label: 'download (origin-only)' },
  { id: 'download-versioned', label: 'download@docVersion' },
];

interface UploadResponse {
  tag: 'created' | 'deduped';
  document: {
    id: string;
    tenantId: string;
    state: string;
    metadata: Record<string, unknown> | null;
  };
  token: string;
  tenantId: string;
  layerName: string;
  sub: string;
  scope: string[];
  identity: IdentityInput;
}

interface IdentityInput {
  user_id?: string;
  group_id?: string;
  groups?: string[];
  display_name?: string;
}

interface ScopeOption {
  value: string;
  label: string;
}

interface ScopePreset {
  id: string;
  label: string;
  scopes: string[];
  custom?: string;
}

const DEFAULT_SCOPE = [
  'doc.open',
  'doc.render',
  'doc.text.select',
  'doc.text.copy',
  'doc.annotate.read',
  'doc.annotate.modify',
  'doc.forms.read',
  'doc.metadata.modify',
  'doc.pages.assemble',
  'doc.download',
  'doc.download.flattened',
];

const SCOPE_OPTIONS: ScopeOption[] = [
  { value: 'doc.open', label: 'Open / manifest' },
  { value: 'doc.render', label: 'Render pages' },
  { value: 'doc.text.select', label: 'Text geometry' },
  { value: 'doc.text.copy', label: 'Text copy' },
  { value: 'doc.annotate.read', label: 'Read annotations' },
  { value: 'doc.annotate.modify', label: 'Modify all annotations' },
  { value: 'doc.metadata.modify', label: 'Modify metadata' },
  { value: 'doc.pages.modify', label: 'Modify pages' },
  { value: 'doc.pages.assemble', label: 'Assemble pages' },
  { value: 'doc.download', label: 'Download' },
  { value: 'doc.download.flattened', label: 'Download flattened' },
  { value: 'doc.redact', label: 'Redact' },
  { value: 'doc.print', label: 'Print' },
  { value: 'doc.print.high', label: 'High quality print' },
  { value: 'doc.forms.read', label: 'Read forms' },
  { value: 'doc.forms.fill', label: 'Fill forms' },
  { value: 'doc.forms.modify', label: 'Modify forms' },
  { value: 'pdf.permissions', label: 'PDF permissions' },
  { value: '*', label: 'Wildcard' },
];

const SCOPE_PRESETS: ScopePreset[] = [
  { id: 'smoke-full', label: 'Smoke full', scopes: DEFAULT_SCOPE },
  { id: 'viewer', label: 'Viewer', scopes: ['doc.open', 'doc.render'] },
  { id: 'pdf-defaults', label: 'PDF defaults', scopes: ['pdf.permissions'] },
  {
    id: 'text-reader',
    label: 'Text reader',
    scopes: ['doc.open', 'doc.render', 'doc.text.select', 'doc.text.copy'],
  },
  {
    id: 'annotation-author',
    label: 'Annotation author',
    scopes: ['doc.open', 'doc.render'],
    custom: 'annotations:create:self\nannotations:update:self\nannotations:delete:self',
  },
  {
    id: 'group-editor',
    label: 'Group editor',
    scopes: ['doc.open', 'doc.render'],
    custom:
      'annotations:create:group=demo-group\nannotations:update:group=demo-group\nannotations:delete:group=demo-group',
  },
  { id: 'download-only', label: 'Download only', scopes: ['doc.open', 'doc.download'] },
  { id: 'wildcard', label: 'Wildcard', scopes: ['*'] },
];

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app missing');

app.innerHTML = `
  <section class="shell">
    <header class="topbar">
      <div>
        <h1>EmbedPDF Cloud Smoke</h1>
        <p id="status">Connecting...</p>
      </div>
      <button id="refreshDocs" type="button">Refresh Docs</button>
    </header>

    <section class="grid">
      <section class="panel">
        <h2>Admin</h2>
        <label>Tenant <input id="tenantId" autocomplete="off" /></label>
        <label>Layer <input id="layerName" autocomplete="off" value="default" /></label>
        <label>User <input id="subject" autocomplete="off" value="demo-user" /></label>
        <div class="identity-grid">
          <label>User ID <input id="userId" autocomplete="off" value="demo-user" /></label>
          <label>Group ID <input id="groupId" autocomplete="off" value="demo-group" /></label>
          <label>Groups <input id="groups" autocomplete="off" value="demo-group" /></label>
          <label>Display Name <input id="displayName" autocomplete="off" value="Demo User" /></label>
        </div>

        <section class="scope-tools">
          <div class="scope-head">
            <h3>Token Scope</h3>
            <select id="scopePreset"></select>
          </div>
          <div id="scopeOptions" class="scope-options"></div>
          <label>Collab / custom scopes <textarea id="customScopes" spellcheck="false"></textarea></label>
        </section>

        <label>PDF <input id="pdfFile" type="file" accept="application/pdf" /></label>
        <button id="uploadPdf" type="button">Upload PDF + Mint Token</button>

        <div class="split">
          <label>Existing Doc ID <input id="mintDocId" autocomplete="off" /></label>
          <button id="mintToken" type="button">Mint Token For Layer</button>
        </div>

        <div class="split">
          <label>Audit Day <input id="auditDay" autocomplete="off" /></label>
          <button id="exportAudit" type="button">Export Audit JSONL</button>
        </div>
        <label class="check">
          <input id="allowOpenDay" type="checkbox" checked />
          <span>Allow open day export</span>
        </label>

        <label>Document Token <textarea id="tokenBox" spellcheck="false"></textarea></label>
        <div id="docs" class="list"></div>
      </section>

      <section class="panel">
        <h2>Cloud Engine</h2>
        <button id="openToken" type="button">Open Token</button>
        <div id="claims" class="kv"></div>

        <div class="security-tools">
          <div class="security-head">
            <h3>Security / Access</h3>
            <button id="showSecurity" type="button">Show Current</button>
          </div>
          <div class="security-grid">
            <label>Password <input id="documentPassword" type="password" autocomplete="current-password" /></label>
            <label>Mode
              <select id="unlockMode">
                <option value="any">Any valid password</option>
                <option value="owner">Owner password</option>
              </select>
            </label>
            <button id="unlockDocument" type="button">Unlock / Access</button>
          </div>
          <div id="securityState" class="kv security-state"></div>
        </div>

        <div class="split">
          <label>Page Object Number <input id="pageObjectNumber" inputmode="numeric" /></label>
          <button id="listPages" type="button">List Pages</button>
        </div>

        <div class="actions">
          <button id="readDocumentActions" type="button">Read Document Actions</button>
          <button id="readForm" type="button">Read Form</button>
          <button id="readText" type="button">Read Text</button>
          <button id="readGeometry" type="button">Read Geometry</button>
          <button id="listAnnots" type="button">List Annotations</button>
          <button id="createHighlight" type="button">Create Highlight</button>
          <button id="beginWeakEdit" type="button">Begin Weak Edit</button>
          <button id="heartbeatWeakEdit" type="button">Heartbeat</button>
          <button id="releaseWeakEdit" type="button">Release</button>
          <button id="deleteFirst" type="button">Delete First</button>
          <button id="moveFirst" type="button">Move First To End</button>
        </div>

        <div class="download-tools">
          <label>Save Mode
            <select id="downloadMode">
              <option value="incremental">Incremental</option>
              <option value="rewrite">Rewrite</option>
            </select>
          </label>
          <button id="downloadPdf" type="button">Download PDF</button>
        </div>

        <div class="metadata-tools">
          <div class="metadata-head">
            <h3>Metadata</h3>
            <button id="readMetadata" type="button">Read Metadata</button>
          </div>
          <div class="metadata-grid">
            <label>Title <input id="metaTitle" autocomplete="off" /></label>
            <label>Author <input id="metaAuthor" autocomplete="off" /></label>
            <label>Subject <input id="metaSubject" autocomplete="off" /></label>
            <label>Keywords <input id="metaKeywords" autocomplete="off" /></label>
            <label>Creator <input id="metaCreator" autocomplete="off" /></label>
            <label>Producer <input id="metaProducer" autocomplete="off" /></label>
            <label>Trapped
              <select id="metaTrapped">
                <option value="">(leave)</option>
                <option value="true">true</option>
                <option value="false">false</option>
                <option value="unknown">unknown</option>
              </select>
            </label>
          </div>
          <label>Custom (JSON map — string sets, null clears)
            <textarea id="metaCustom" spellcheck="false" placeholder='{ "MyKey": "value", "Remove": null }'></textarea>
          </label>
          <label class="check">
            <input id="metaClearEmpty" type="checkbox" />
            <span>Treat empty standard fields as clear (null) instead of leave</span>
          </label>
          <button id="updateMetadata" type="button">Update Metadata</button>
        </div>

        <div class="render-tools">
          <label>Render Format
            <select id="renderFormat">
              <option value="webp">WebP</option>
              <option value="png">PNG</option>
            </select>
          </label>
          <label>Width <input id="renderWidth" inputmode="numeric" value="720" /></label>
          <label>Background
            <select id="renderBackground">
              <option value="white">White</option>
              <option value="transparent">Transparent</option>
            </select>
          </label>
          <label class="check">
            <input id="renderAnnotations" type="checkbox" checked />
            <span>Include annotations</span>
          </label>
          <button id="renderPage" type="button">Render Page</button>
        </div>

        <figure id="renderPreview" class="render-preview">
          <img id="renderImage" alt="Rendered page preview" />
          <figcaption id="renderMeta">No render yet.</figcaption>
        </figure>

        <div class="appearance-tools">
          <label>Appearance Format
            <select id="appearanceFormat">
              <option value="png">PNG (transparent)</option>
              <option value="webp">WebP</option>
            </select>
          </label>
          <label>Scale <input id="appearanceScale" inputmode="decimal" value="2" /></label>
          <button id="renderAppearances" type="button">Render Annotation Appearances</button>
        </div>

        <div id="appearanceGallery" class="appearance-gallery">
          <p class="appearance-empty">No appearances rendered yet.</p>
        </div>

        <pre id="output"></pre>
      </section>
    </section>

    <section class="panel cdn-panel cdn-section">
      <h2>CDN Inspector</h2>

      <p class="cdn-adapter">
        <span>Adapter:</span> <code id="cdnAdapterKind">(loading...)</code>
      </p>
      <div id="cdnAdapterInfo" class="kv"></div>
      <div class="cdn-tools">
        <button id="fetchAccess" type="button">Fetch /v1/access for current token</button>
      </div>
      <div id="cdnEffectiveScope" class="cdn-scope-row"></div>

      <div class="cdn-base-block">
        <h3>baseUrlOverrides</h3>
        <p class="cdn-hint">
          Per-resource CDN-origin swap. Resources missing from this map fall
          through to the API origin — that's how scope narrowing works at
          the edge.
        </p>
        <table class="cdn-table" id="cdnBaseOverrides">
          <thead><tr><th>resourceId</th><th>CDN origin</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>

      <div class="cdn-policies-block">
        <h3>signedPathPolicies</h3>
        <p class="cdn-hint">
          One entry per granted resource prefix. SDK longest-prefix-matches
          against the request path and appends <code>queryParams</code>.
        </p>
        <table class="cdn-table" id="cdnPathPolicies">
          <thead><tr><th>pathPrefix</th><th>queryParams</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>

      <div class="cdn-extras-block">
        <h3>signedCookies / authHeader / signedQueryParams</h3>
        <pre id="cdnExtras" class="cdn-extras">(no /access fetched yet)</pre>
      </div>

      <div class="cdn-preview-title">
        <h3>URL preview</h3>
        <p class="cdn-hint">
          Pick a resource + page/version numbers; the inspector shows the
          origin URL the SDK would have requested, the final CDN URL after
          applying overrides + matching policy, and whether the request
          routes to the CDN or falls through to origin.
        </p>
      </div>
      <div class="cdn-preview-form">
        <label>Resource
          <select id="previewResource">
            ${PREVIEW_RESOURCES.map((r) => `<option value="${r.id}">${r.label}</option>`).join('')}
          </select>
        </label>
        <label>Doc ID <input id="previewDocId" autocomplete="off" /></label>
        <label>Layer <input id="previewLayer" autocomplete="off" value="default" /></label>
        <label>pageObjectNumber <input id="previewPon" inputmode="numeric" value="1" /></label>
        <label>docVersion <input id="previewDocVer" inputmode="numeric" value="1" /></label>
        <label>contentVersion <input id="previewContentVer" inputmode="numeric" value="1" /></label>
        <label>annotationVersion <input id="previewAnnotVer" inputmode="numeric" value="1" /></label>
        <label>actionsVersion <input id="previewActionsVer" inputmode="numeric" value="1" /></label>
        <button id="previewBuild" type="button">Build URL</button>
      </div>
      <pre id="cdnPreviewOutput" class="cdn-preview-output">(Pick a resource and click Build URL.)</pre>
    </section>
  </section>
`;

const els = {
  status: must<HTMLParagraphElement>('status'),
  tenantId: must<HTMLInputElement>('tenantId'),
  layerName: must<HTMLInputElement>('layerName'),
  subject: must<HTMLInputElement>('subject'),
  userId: must<HTMLInputElement>('userId'),
  groupId: must<HTMLInputElement>('groupId'),
  groups: must<HTMLInputElement>('groups'),
  displayName: must<HTMLInputElement>('displayName'),
  scopePreset: must<HTMLSelectElement>('scopePreset'),
  scopeOptions: must<HTMLDivElement>('scopeOptions'),
  customScopes: must<HTMLTextAreaElement>('customScopes'),
  pdfFile: must<HTMLInputElement>('pdfFile'),
  uploadPdf: must<HTMLButtonElement>('uploadPdf'),
  mintDocId: must<HTMLInputElement>('mintDocId'),
  mintToken: must<HTMLButtonElement>('mintToken'),
  auditDay: must<HTMLInputElement>('auditDay'),
  exportAudit: must<HTMLButtonElement>('exportAudit'),
  allowOpenDay: must<HTMLInputElement>('allowOpenDay'),
  tokenBox: must<HTMLTextAreaElement>('tokenBox'),
  docs: must<HTMLDivElement>('docs'),
  openToken: must<HTMLButtonElement>('openToken'),
  claims: must<HTMLDivElement>('claims'),
  documentPassword: must<HTMLInputElement>('documentPassword'),
  unlockMode: must<HTMLSelectElement>('unlockMode'),
  unlockDocument: must<HTMLButtonElement>('unlockDocument'),
  showSecurity: must<HTMLButtonElement>('showSecurity'),
  securityState: must<HTMLDivElement>('securityState'),
  pageObjectNumber: must<HTMLInputElement>('pageObjectNumber'),
  listPages: must<HTMLButtonElement>('listPages'),
  readDocumentActions: must<HTMLButtonElement>('readDocumentActions'),
  readForm: must<HTMLButtonElement>('readForm'),
  readText: must<HTMLButtonElement>('readText'),
  readGeometry: must<HTMLButtonElement>('readGeometry'),
  listAnnots: must<HTMLButtonElement>('listAnnots'),
  readMetadata: must<HTMLButtonElement>('readMetadata'),
  updateMetadata: must<HTMLButtonElement>('updateMetadata'),
  metaTitle: must<HTMLInputElement>('metaTitle'),
  metaAuthor: must<HTMLInputElement>('metaAuthor'),
  metaSubject: must<HTMLInputElement>('metaSubject'),
  metaKeywords: must<HTMLInputElement>('metaKeywords'),
  metaCreator: must<HTMLInputElement>('metaCreator'),
  metaProducer: must<HTMLInputElement>('metaProducer'),
  metaTrapped: must<HTMLSelectElement>('metaTrapped'),
  metaCustom: must<HTMLTextAreaElement>('metaCustom'),
  metaClearEmpty: must<HTMLInputElement>('metaClearEmpty'),
  renderFormat: must<HTMLSelectElement>('renderFormat'),
  renderWidth: must<HTMLInputElement>('renderWidth'),
  renderBackground: must<HTMLSelectElement>('renderBackground'),
  renderAnnotations: must<HTMLInputElement>('renderAnnotations'),
  renderPage: must<HTMLButtonElement>('renderPage'),
  renderPreview: must<HTMLElement>('renderPreview'),
  renderImage: must<HTMLImageElement>('renderImage'),
  renderMeta: must<HTMLElement>('renderMeta'),
  appearanceFormat: must<HTMLSelectElement>('appearanceFormat'),
  appearanceScale: must<HTMLInputElement>('appearanceScale'),
  renderAppearances: must<HTMLButtonElement>('renderAppearances'),
  appearanceGallery: must<HTMLDivElement>('appearanceGallery'),
  createHighlight: must<HTMLButtonElement>('createHighlight'),
  beginWeakEdit: must<HTMLButtonElement>('beginWeakEdit'),
  heartbeatWeakEdit: must<HTMLButtonElement>('heartbeatWeakEdit'),
  releaseWeakEdit: must<HTMLButtonElement>('releaseWeakEdit'),
  deleteFirst: must<HTMLButtonElement>('deleteFirst'),
  moveFirst: must<HTMLButtonElement>('moveFirst'),
  downloadMode: must<HTMLSelectElement>('downloadMode'),
  downloadPdf: must<HTMLButtonElement>('downloadPdf'),
  refreshDocs: must<HTMLButtonElement>('refreshDocs'),
  output: must<HTMLPreElement>('output'),
  cdnAdapterKind: must<HTMLElement>('cdnAdapterKind'),
  cdnAdapterInfo: must<HTMLDivElement>('cdnAdapterInfo'),
  fetchAccess: must<HTMLButtonElement>('fetchAccess'),
  cdnEffectiveScope: must<HTMLDivElement>('cdnEffectiveScope'),
  cdnBaseOverrides: must<HTMLTableElement>('cdnBaseOverrides'),
  cdnPathPolicies: must<HTMLTableElement>('cdnPathPolicies'),
  cdnExtras: must<HTMLPreElement>('cdnExtras'),
  previewResource: must<HTMLSelectElement>('previewResource'),
  previewDocId: must<HTMLInputElement>('previewDocId'),
  previewLayer: must<HTMLInputElement>('previewLayer'),
  previewPon: must<HTMLInputElement>('previewPon'),
  previewDocVer: must<HTMLInputElement>('previewDocVer'),
  previewContentVer: must<HTMLInputElement>('previewContentVer'),
  previewAnnotVer: must<HTMLInputElement>('previewAnnotVer'),
  previewActionsVer: must<HTMLInputElement>('previewActionsVer'),
  previewBuild: must<HTMLButtonElement>('previewBuild'),
  cdnPreviewOutput: must<HTMLPreElement>('cdnPreviewOutput'),
};

let config: AppConfig;
let doc: DocumentHandle | null = null;
let pages: PageListSnapshot | null = null;
let annotations: AnnotationListPageSnapshot | null = null;
let weakSession: WeakAnnotationEditSession | null = null;
let renderObjectUrl: string | null = null;
let appearanceObjectUrls: string[] = [];
let lastAccess: AccessResponse | null = null;

void boot();

async function boot(): Promise<void> {
  renderScopeControls();
  config = await getJson<AppConfig>('/api/config');
  els.tenantId.value = config.tenantId;
  els.auditDay.value = new Date().toISOString().slice(0, 10);
  els.status.textContent = `Origin ${config.originBaseUrl}`;
  renderCdnAdapter(config.cdn);
  await refreshDocs();
}

els.refreshDocs.addEventListener('click', () => void run(refreshDocs));
els.uploadPdf.addEventListener('click', () => void run(uploadPdf));
els.mintToken.addEventListener('click', () => void run(mintToken));
els.exportAudit.addEventListener('click', () => void run(exportAudit));
els.openToken.addEventListener('click', () => void run(openToken));
els.showSecurity.addEventListener('click', () => void run(showSecurity));
els.unlockDocument.addEventListener('click', () => void run(unlockDocument));
els.listPages.addEventListener('click', () => void run(listPages));
els.readDocumentActions.addEventListener('click', () => void run(readDocumentActions));
els.readForm.addEventListener('click', () => void run(readForm));
els.readText.addEventListener('click', () => void run(readText));
els.readGeometry.addEventListener('click', () => void run(readGeometry));
els.listAnnots.addEventListener('click', () => void run(listAnnotations));
els.readMetadata.addEventListener('click', () => void run(readMetadata));
els.updateMetadata.addEventListener('click', () => void run(updateMetadata));
els.renderPage.addEventListener('click', () => void run(renderPage));
els.renderAppearances.addEventListener('click', () => void run(renderAppearances));
els.createHighlight.addEventListener('click', () => void run(createHighlight));
els.beginWeakEdit.addEventListener('click', () => void run(beginWeakEdit));
els.heartbeatWeakEdit.addEventListener('click', () => void run(heartbeatWeakEdit));
els.releaseWeakEdit.addEventListener('click', () => void run(releaseWeakEdit));
els.deleteFirst.addEventListener('click', () => void run(deleteFirstAnnotation));
els.moveFirst.addEventListener('click', () => void run(moveFirstAnnotation));
els.downloadPdf.addEventListener('click', () => void run(downloadPdf));
els.scopePreset.addEventListener('change', () => applyScopePreset(els.scopePreset.value));
els.fetchAccess.addEventListener('click', () => void run(fetchAccess));
els.previewBuild.addEventListener('click', () => void run(buildPreview));

async function uploadPdf(): Promise<void> {
  const file = els.pdfFile.files?.[0];
  if (!file) throw new Error('Choose a PDF first.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const params = new URLSearchParams({
    tenantId: tenantId(),
    layerName: layerName(),
    sub: subject(),
  });
  for (const scope of selectedScope()) params.append('scope', scope);
  appendIdentityParams(params, selectedIdentity());
  const response = await fetch(`/api/admin/upload?${params}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/pdf',
      'X-File-Name': file.name,
    },
    body: bytes,
  });
  const result = await parseResponse<UploadResponse>(response);
  els.tokenBox.value = result.token;
  els.mintDocId.value = result.document.id;
  setOutput(result);
  await refreshDocs();
}

async function mintToken(): Promise<void> {
  const docId = els.mintDocId.value.trim();
  if (!docId) throw new Error('Choose or enter a doc id.');
  const result = await postJson<{ token: string; layerName: string; docId: string }>(
    '/api/admin/mint-token',
    {
      tenantId: tenantId(),
      docId,
      layerName: layerName(),
      sub: subject(),
      ttlSeconds: 3600,
      scope: selectedScope(),
      ...selectedIdentity(),
    },
  );
  els.tokenBox.value = result.token;
  setOutput(result);
}

async function exportAudit(): Promise<void> {
  const docId = els.mintDocId.value.trim();
  if (!docId) throw new Error('Choose or enter a doc id.');
  const result = await postJson('/api/admin/audit-export', {
    tenantId: tenantId(),
    docId,
    day: els.auditDay.value.trim(),
    allowOpenDay: els.allowOpenDay.checked,
    force: true,
  });
  setOutput(result);
}

async function openToken(): Promise<void> {
  const token = els.tokenBox.value.trim();
  if (!token) throw new Error('Paste or mint a document token.');
  await doc?.close();
  weakSession = null;
  pages = null;
  annotations = null;
  clearRenderPreview();
  resetAppearanceGallery();
  const engine = createCloudEngine({ baseUrl: config.engineBaseUrl });
  doc = await engine.open({ kind: 'token', token });
  renderClaims(token);
  renderSecurityFromHandle(doc);
  await listPages();
}

async function showSecurity(): Promise<void> {
  const opened = requireDoc();
  renderSecurityFromHandle(opened);
  setOutput({
    security: opened.security.current,
    effectiveScope: opened.security.effectiveScope,
    identity: opened.security.identity,
    passwordPrompt: opened.security.passwordPrompt,
  });
}

async function unlockDocument(): Promise<void> {
  const opened = requireDoc();
  const result = await opened.security.unlock({
    password: els.documentPassword.value,
    mode: unlockMode(),
  });
  renderSecurityFromHandle(opened);
  setOutput(result);
}

/**
 * Render the unified security surface — same accessors every dev
 * uses (`current`, `effectiveScope`, `identity`, `passwordPrompt`).
 * Demonstrates the engine-agnostic shape: this code would work
 * identically against a `LocalDocumentHandle`.
 */
function renderSecurityFromHandle(handle: DocumentHandle): void {
  renderSecurity(handle.security.current);
  // Append the unified accessors as extra rows in the same table.
  const prompt = handle.security.passwordPrompt;
  const promptDesc =
    prompt.state === 'none'
      ? 'none'
      : prompt.state === 'required'
        ? `required (${prompt.hint ?? 'unknown'})`
        : `optional (${prompt.hint})`;
  const extras: Array<[string, unknown]> = [
    ['passwordPrompt', promptDesc],
    ['effectiveScope', handle.security.effectiveScope.length],
    ['identity', handle.security.identity?.user_id ?? null],
  ];
  for (const [key, value] of extras) {
    const row = document.createElement('div');
    row.innerHTML = `<span>${key}</span><strong>${JSON.stringify(value)}</strong>`;
    els.securityState.append(row);
  }
}

async function listPages(): Promise<void> {
  const opened = requireDoc();
  pages = await opened.pages.list();
  const first = pages.pages[0];
  if (first && !els.pageObjectNumber.value) {
    els.pageObjectNumber.value = String(first.pageObjectNumber);
  }
  setOutput(pages);
}

async function readDocumentActions(): Promise<void> {
  const actions = requireDoc().actions;
  if (!actions) throw new Error('This engine does not expose document actions.');
  setOutput(await actions.read());
}

async function readForm(): Promise<void> {
  setOutput(await requireDoc().forms.list());
}

async function readText(): Promise<void> {
  const page = requireDoc().page(selectedPage());
  setOutput(await page.text.read());
}

async function readGeometry(): Promise<void> {
  const page = requireDoc().page(selectedPage());
  setOutput(summarizeGeometry(await page.geometry.read()));
}

async function renderPage(): Promise<void> {
  const opened = requireDoc();
  const page = opened.page(selectedPage());
  const width = readPositiveInteger(els.renderWidth.value, 'Render width');
  const image = await page.render.image({
    format: renderFormat(),
    viewport: { kind: 'width', width },
    background: renderBackground(),
    includeAnnotations: els.renderAnnotations.checked,
  });
  await showRenderedImage(image, selectedPage());
}

async function listAnnotations(): Promise<void> {
  annotations = await requireDoc().page(selectedPage()).annotations.list();
  setOutput(annotations);
}

/**
 * Batch-render every annotation appearance (`/AP`) stream on the page through
 * the cloud's `multipart/form-data` endpoint. Each annotation comes back as
 * its own image cropped to its `/Rect`, which we show in a gallery. This is
 * the same `renderAppearanceImages()` call a `LocalDocumentHandle` exposes —
 * only the transport differs.
 */
async function renderAppearances(): Promise<void> {
  const page = requireDoc().page(selectedPage());
  const result = await page.annotations.renderAppearanceImages({
    format: appearanceFormat(),
    scale: appearanceScale(),
  });
  await showAppearanceImages(result);
}

async function showAppearanceImages(result: AnnotationAppearanceImagesResult): Promise<void> {
  resetAppearanceGallery();
  els.appearanceGallery.innerHTML = '';

  if (result.appearances.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'appearance-empty';
    empty.textContent = 'This page has no annotation appearance streams to render.';
    els.appearanceGallery.append(empty);
  } else {
    for (const appearance of result.appearances) {
      const objectUrl = await appearance.image.objectUrl();
      appearanceObjectUrls.push(objectUrl.url);

      const figure = document.createElement('figure');
      figure.className = 'appearance-card';
      const img = document.createElement('img');
      img.src = objectUrl.url;
      img.alt = `Appearance ${describeRef(appearance.ref)}`;
      const caption = document.createElement('figcaption');
      const size =
        appearance.image.width && appearance.image.height
          ? `${appearance.image.width}x${appearance.image.height}`
          : '';
      caption.innerHTML =
        `<strong>${escapeHtml(describeRef(appearance.ref))}</strong>` +
        `<span>${escapeHtml(appearance.mode)} · ${appearance.image.format.toUpperCase()} ${size}</span>`;
      figure.append(img, caption);
      els.appearanceGallery.append(figure);
    }
  }

  setOutput({
    pageState: result.pageState,
    count: result.appearances.length,
    appearances: result.appearances.map((a) => ({
      ref: a.ref,
      mode: a.mode,
      rect: a.rect,
      format: a.image.format,
      width: a.image.width,
      height: a.image.height,
    })),
  });
}

function resetAppearanceGallery(): void {
  for (const url of appearanceObjectUrls) URL.revokeObjectURL(url);
  appearanceObjectUrls = [];
  els.appearanceGallery.innerHTML = '<p class="appearance-empty">No appearances rendered yet.</p>';
}

function describeRef(ref: AnnotationAppearanceImagesResult['appearances'][number]['ref']): string {
  switch (ref.kind) {
    case 'objectNumber':
      return `obj ${ref.annotObjectNumber}`;
    case 'nm':
      return `nm ${ref.nm}`;
    case 'index':
      return `index ${ref.index} (weak)`;
  }
}

async function readMetadata(): Promise<void> {
  const metadata = await requireDoc().metadata.read();
  populateMetadataForm(metadata);
  setOutput(metadata);
}

async function updateMetadata(): Promise<void> {
  const patch = buildMetadataPatch();
  const result = await requireDoc().metadata.update(patch);
  populateMetadataForm(result.metadata);
  setOutput({ patch, result });
}

/**
 * Mirror the read DTO back into the form so the standard fields and the
 * custom map reflect what is actually stored after a read or a write.
 */
function populateMetadataForm(metadata: DocumentMetadata): void {
  els.metaTitle.value = metadata.title ?? '';
  els.metaAuthor.value = metadata.author ?? '';
  els.metaSubject.value = metadata.subject ?? '';
  els.metaKeywords.value = metadata.keywords ?? '';
  els.metaCreator.value = metadata.creator ?? '';
  els.metaProducer.value = metadata.producer ?? '';
  els.metaTrapped.value = '';
  els.metaCustom.value =
    Object.keys(metadata.custom).length > 0 ? JSON.stringify(metadata.custom, null, 2) : '';
}

/**
 * Build a three-state {@link MetadataPatch} from the form. A non-empty
 * standard field sets the value; an empty field either clears it (null)
 * or leaves it untouched (undefined) depending on the "clear empty"
 * toggle. `trapped` only ships when an explicit value is picked, and the
 * custom JSON map carries its own per-key string/null three-state.
 */
function buildMetadataPatch(): MetadataPatch {
  const clearEmpty = els.metaClearEmpty.checked;
  const field = (raw: string): string | null | undefined => {
    const value = raw.trim();
    if (value) return value;
    return clearEmpty ? null : undefined;
  };
  const patch: MetadataPatch = {};
  const standard: Array<[keyof MetadataPatch, string]> = [
    ['title', els.metaTitle.value],
    ['author', els.metaAuthor.value],
    ['subject', els.metaSubject.value],
    ['keywords', els.metaKeywords.value],
    ['creator', els.metaCreator.value],
    ['producer', els.metaProducer.value],
  ];
  for (const [key, raw] of standard) {
    const value = field(raw);
    if (value !== undefined) (patch as Record<string, unknown>)[key] = value;
  }
  const trapped = els.metaTrapped.value;
  if (trapped === 'true' || trapped === 'false' || trapped === 'unknown') {
    patch.trapped = trapped as DocumentMetadataTrapped;
  }
  const custom = parseCustomMetadata(els.metaCustom.value);
  if (custom) patch.custom = custom;
  return patch;
}

function parseCustomMetadata(raw: string): Record<string, string | null> | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Custom metadata must be valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Custom metadata must be a JSON object of string|null values.');
  }
  const custom: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== null && typeof value !== 'string') {
      throw new Error(`Custom key "${key}" must be a string or null.`);
    }
    custom[key] = value;
  }
  return custom;
}

async function createHighlight(): Promise<void> {
  const draft: AnnotationDraft = {
    subtype: 'highlight',
    contents: `cloud smoke ${new Date().toISOString()}`,
    color: { r: 255, g: 214, b: 102 },
    opacity: 0.6,
    quadPoints: [
      {
        p1: { x: 0, y: 0 },
        p2: { x: 40, y: 0 },
        p3: { x: 0, y: 16 },
        p4: { x: 40, y: 16 },
      },
    ],
  };
  const result = await requireDoc().page(selectedPage()).annotations.create(draft);
  setOutput(result);
  await listAnnotations();
}

async function beginWeakEdit(): Promise<void> {
  weakSession = await requireDoc().annotations.beginWeakEdit([selectedPage()]);
  setOutput({
    sessionId: weakSession.id,
    expiresAt: weakSession.expiresAt,
    heartbeatIntervalMs: weakSession.heartbeatIntervalMs,
    pageObjectNumbers: weakSession.pageObjectNumbers,
  });
}

async function heartbeatWeakEdit(): Promise<void> {
  if (!weakSession) throw new Error('No weak edit session.');
  await weakSession.updatePages([selectedPage()]);
  await weakSession.heartbeat();
  setOutput({
    sessionId: weakSession.id,
    expiresAt: weakSession.expiresAt,
    pageObjectNumbers: weakSession.pageObjectNumbers,
  });
}

async function releaseWeakEdit(): Promise<void> {
  if (!weakSession) return;
  await weakSession.release();
  setOutput({ released: weakSession.id });
  weakSession = null;
}

async function deleteFirstAnnotation(): Promise<void> {
  const ref = firstAnnotationRef();
  const result = await requireDoc().page(ref.pageObjectNumber).annotations.delete(ref);
  setOutput(result);
  await listAnnotations();
}

async function moveFirstAnnotation(): Promise<void> {
  const ref = firstAnnotationRef();
  const count = annotations?.annotations.length ?? 1;
  const result = await requireDoc()
    .page(ref.pageObjectNumber)
    .annotations.move([ref], count - 1);
  setOutput(result);
  await listAnnotations();
}

async function downloadPdf(): Promise<void> {
  const opened = requireDoc();
  const mode = downloadMode();
  const bytes = await opened.download({ mode });
  const tokenClaims = decodeJwtPayload(els.tokenBox.value.trim());
  const docId = typeof tokenClaims.doc_id === 'string' ? tokenClaims.doc_id : opened.id;
  const layer =
    typeof tokenClaims.layer_name === 'string' && tokenClaims.layer_name.length > 0
      ? tokenClaims.layer_name
      : layerName();
  saveBytesAsPdf(bytes, `${safeFilePart(docId)}-${safeFilePart(layer)}-${mode}.pdf`);
  setOutput({
    downloaded: true,
    mode,
    bytes: bytes.byteLength,
    fileName: `${safeFilePart(docId)}-${safeFilePart(layer)}-${mode}.pdf`,
  });
}

async function refreshDocs(): Promise<void> {
  const params = new URLSearchParams({ tenantId: tenantId() || config?.tenantId || 'tenant-demo' });
  const result = await getJson<{ documents: UploadResponse['document'][] }>(
    `/api/admin/documents?${params}`,
  );
  els.docs.innerHTML = '';
  for (const item of result.documents) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'doc-row';
    button.textContent = `${item.id} (${item.state})`;
    button.addEventListener('click', () => {
      els.mintDocId.value = item.id;
      setOutput(item);
    });
    els.docs.append(button);
  }
}

function firstAnnotationRef(): AnnotationRef {
  const first = annotations?.annotations[0];
  if (!first) throw new Error('List annotations first; there is no first annotation yet.');
  return first.ref;
}

function selectedPage(): PageObjectNumber {
  return readPositiveInteger(els.pageObjectNumber.value, 'Page object number') as PageObjectNumber;
}

function requireDoc(): DocumentHandle {
  if (!doc) throw new Error('Open a document token first.');
  return doc;
}

function tenantId(): string {
  return els.tenantId.value.trim() || config?.tenantId || 'tenant-demo';
}

function layerName(): string {
  return els.layerName.value.trim() || 'default';
}

function subject(): string {
  return els.subject.value.trim() || 'demo-user';
}

function renderFormat(): 'png' | 'webp' {
  if (els.renderFormat.value === 'png' || els.renderFormat.value === 'webp') {
    return els.renderFormat.value;
  }
  throw new Error('Render format must be PNG or WebP.');
}

function renderBackground(): 'white' | 'transparent' {
  if (els.renderBackground.value === 'white' || els.renderBackground.value === 'transparent') {
    return els.renderBackground.value;
  }
  throw new Error('Render background must be white or transparent.');
}

function appearanceFormat(): 'png' | 'webp' {
  if (els.appearanceFormat.value === 'png' || els.appearanceFormat.value === 'webp') {
    return els.appearanceFormat.value;
  }
  throw new Error('Appearance format must be PNG or WebP.');
}

function appearanceScale(): number {
  const value = Number(els.appearanceScale.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Appearance scale must be a positive number.');
  }
  return value;
}

function downloadMode(): PdfSaveMode {
  if (els.downloadMode.value === 'incremental' || els.downloadMode.value === 'rewrite') {
    return els.downloadMode.value;
  }
  throw new Error('Download mode must be incremental or rewrite.');
}

function unlockMode(): 'any' | 'owner' {
  if (els.unlockMode.value === 'any' || els.unlockMode.value === 'owner') {
    return els.unlockMode.value;
  }
  throw new Error('Unlock mode must be any or owner.');
}

function readPositiveInteger(raw: string, label: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

async function showRenderedImage(
  image: PageImageHandle,
  pageObjectNumber: PageObjectNumber,
): Promise<void> {
  clearRenderPreview();
  const objectUrl = await image.objectUrl();
  renderObjectUrl = objectUrl.url;

  els.renderImage.src = renderObjectUrl;
  els.renderPreview.classList.add('has-image');
  els.renderMeta.textContent = [
    `${image.format.toUpperCase()} page ${pageObjectNumber}`,
    image.width && image.height
      ? `${image.width}x${image.height}`
      : `width ${els.renderWidth.value}`,
    els.renderAnnotations.checked ? 'annotations on' : 'annotations off',
  ].join(' | ');
  setOutput({
    pageObjectNumber,
    format: image.format,
    contentType: image.contentType,
    source:
      image.source.kind === 'url' ? image.source.url : `${image.source.bytes.byteLength} bytes`,
  });
}

function clearRenderPreview(): void {
  if (renderObjectUrl) {
    URL.revokeObjectURL(renderObjectUrl);
    renderObjectUrl = null;
  }
  els.renderImage.removeAttribute('src');
  els.renderPreview.classList.remove('has-image');
  els.renderMeta.textContent = 'No render yet.';
}

function renderClaims(token: string): void {
  const claims = decodeJwtPayload(token);
  els.claims.innerHTML = '';
  for (const key of [
    'tenant_id',
    'doc_id',
    'layer_name',
    'sub',
    'scope',
    'user_id',
    'group_id',
    'groups',
    'display_name',
    'exp',
  ]) {
    const row = document.createElement('div');
    row.innerHTML = `<span>${key}</span><strong>${JSON.stringify(claims[key])}</strong>`;
    els.claims.append(row);
  }
}

function renderScopeControls(): void {
  els.scopePreset.innerHTML = '';
  for (const preset of SCOPE_PRESETS) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.label;
    els.scopePreset.append(option);
  }

  els.scopeOptions.innerHTML = '';
  for (const option of SCOPE_OPTIONS) {
    const id = `scope-${option.value.replace(/[^a-z0-9]+/gi, '-')}`;
    const label = document.createElement('label');
    label.className = 'scope-option';
    label.htmlFor = id;
    label.innerHTML = `
      <input id="${id}" type="checkbox" value="${option.value}" />
      <span>${option.label}</span>
      <code>${option.value}</code>
    `;
    els.scopeOptions.append(label);
  }

  applyScopePreset(SCOPE_PRESETS[0].id);
}

function applyScopePreset(id: string): void {
  const preset = SCOPE_PRESETS.find((item) => item.id === id) ?? SCOPE_PRESETS[0];
  const values = new Set(preset.scopes);
  for (const input of scopeCheckboxes()) {
    input.checked = values.has(input.value);
  }
  els.customScopes.value = preset.custom ?? '';
}

function selectedScope(): string[] {
  const values = [
    ...scopeCheckboxes()
      .filter((input) => input.checked)
      .map((input) => input.value),
    ...splitList(els.customScopes.value),
  ];
  return [...new Set(values)];
}

function selectedIdentity(): IdentityInput {
  const userId = els.userId.value.trim();
  const groupId = els.groupId.value.trim();
  const groups = splitList(els.groups.value);
  const displayName = els.displayName.value.trim();
  return {
    ...(userId ? { user_id: userId } : {}),
    ...(groupId ? { group_id: groupId } : {}),
    ...(groups.length > 0 ? { groups } : {}),
    ...(displayName ? { display_name: displayName } : {}),
  };
}

function appendIdentityParams(params: URLSearchParams, identity: IdentityInput): void {
  if (identity.user_id) params.set('user_id', identity.user_id);
  if (identity.group_id) params.set('group_id', identity.group_id);
  if (identity.groups?.length) params.set('groups', identity.groups.join(','));
  if (identity.display_name) params.set('display_name', identity.display_name);
}

function scopeCheckboxes(): HTMLInputElement[] {
  return Array.from(els.scopeOptions.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
}

function splitList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function renderSecurity(value: DocumentHandle['security']['current']): void {
  els.securityState.innerHTML = '';
  const rows: Array<[string, unknown]> = [
    ['encryption', value.encryption.state],
    ['password', value.encryption.requiresPassword],
    ['openedAs', value.permissions.openedAs],
    ['permissions', value.permissions.known ? value.permissions.bits : 'unknown'],
    ['allAllowed', value.permissions.allAllowed],
    ['upgradeOwner', value.permissions.canUpgradeToOwner],
    ['access', value.access.required ? value.access.reasons : false],
  ];
  for (const [key, rowValue] of rows) {
    const row = document.createElement('div');
    row.innerHTML = `<span>${key}</span><strong>${JSON.stringify(rowValue)}</strong>`;
    els.securityState.append(row);
  }
}

function setOutput(value: unknown): void {
  els.output.textContent = JSON.stringify(value, null, 2);
}

function saveBytesAsPdf(bytes: Uint8Array, fileName: string): void {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilePart(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  return cleaned.length > 0 ? cleaned : 'document';
}

function summarizeGeometry(snapshot: PageGeometrySnapshot): unknown {
  return {
    runCount: snapshot.runs.length,
    glyphCount: snapshot.runs.reduce((total, run) => total + run.glyphs.length, 0),
    sampleRuns: snapshot.runs.slice(0, 5),
  };
}

async function run(fn: () => Promise<void>): Promise<void> {
  try {
    els.status.textContent = 'Working...';
    await fn();
    els.status.textContent = `Ready`;
  } catch (err) {
    els.status.textContent = 'Error';
    setOutput({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function getJson<T>(path: string): Promise<T> {
  return parseResponse<T>(await fetch(path));
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  return parseResponse<T>(
    await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

async function parseResponse<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) {
    const message =
      json && typeof json === 'object' && 'error' in json
        ? JSON.stringify((json as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return json as T;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  if (!payload) return {};
  const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
  return JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
}

async function fetchAccess(): Promise<void> {
  const token = els.tokenBox.value.trim();
  if (!token) throw new Error('Mint or paste a document token first.');
  const claims = decodeJwtPayload(token);
  const docId = typeof claims['doc_id'] === 'string' ? (claims['doc_id'] as string) : '';
  const tokenLayer =
    typeof claims['layer_name'] === 'string' && (claims['layer_name'] as string).length > 0
      ? (claims['layer_name'] as string)
      : layerName();
  if (!docId) throw new Error('Token has no doc_id claim — mint a doc-scoped token.');
  const access = await postJson<AccessResponse>('/api/admin/access', {
    token,
    docId,
    layerName: tokenLayer,
  });
  lastAccess = access;
  renderAccess(access);
  // Pre-fill the URL preview form with the doc/layer from the access
  // response so "Build URL" works straight away.
  els.previewDocId.value = docId;
  els.previewLayer.value = tokenLayer;
  setOutput({ access });
}

/**
 * Build a representative request path for the chosen DocResourceId so
 * the inspector can show what the SDK would actually fetch. Mirrors
 * the wirePaths helpers in engine-core but uses the inspector's form
 * inputs (page object number, version numbers) instead of real
 * manifest data.
 */
function exampleRequestPath(
  resourceId: DocResourceId,
  ctx: {
    docId: string;
    layerName: string;
    pageObjectNumber: number;
    docVersion: number;
    layoutVersion: number;
    metadataVersion: number;
    actionsVersion: number;
    contentVersion: number;
    annotationVersion: number;
  },
): string {
  switch (resourceId) {
    case 'head':
      return wirePaths.docHead(ctx.docId);
    case 'manifest':
      return wirePaths.docManifest(ctx.docId, ctx.docVersion);
    case 'layer-manifest':
      return wirePaths.layerManifest(ctx.docId, ctx.layerName, ctx.docVersion);
    case 'layer-layout':
      return wirePaths.layerLayout(ctx.docId, ctx.layerName, ctx.layoutVersion);
    case 'layer-metadata':
      return wirePaths.layerMetadata(ctx.docId, ctx.layerName, ctx.metadataVersion);
    case 'layer-actions':
      return wirePaths.layerActions(ctx.docId, ctx.layerName, ctx.actionsVersion);
    case 'page-render':
      return wirePaths.docPageRender(ctx.docId, ctx.pageObjectNumber, {
        contentVersion: ctx.contentVersion,
      });
    case 'layer-page-render':
      return wirePaths.layerPageRender(ctx.docId, ctx.layerName, ctx.pageObjectNumber, {
        contentVersion: ctx.contentVersion,
      });
    case 'page-text':
      return wirePaths.docPageText(ctx.docId, ctx.pageObjectNumber, ctx.contentVersion);
    case 'layer-page-text':
      return wirePaths.layerPageText(
        ctx.docId,
        ctx.layerName,
        ctx.pageObjectNumber,
        ctx.contentVersion,
      );
    case 'page-geometry':
      return wirePaths.docPageGeometry(ctx.docId, ctx.pageObjectNumber, ctx.contentVersion);
    case 'layer-page-geometry':
      return wirePaths.layerPageGeometry(
        ctx.docId,
        ctx.layerName,
        ctx.pageObjectNumber,
        ctx.contentVersion,
      );
    case 'annotations-read':
      return wirePaths.layerPageAnnotations(
        ctx.docId,
        ctx.layerName,
        ctx.pageObjectNumber,
        ctx.annotationVersion,
      );
    case 'download-current':
      return wirePaths.layerDownload(ctx.docId, ctx.layerName);
    case 'download-versioned':
      return wirePaths.layerDownloadVersioned(ctx.docId, ctx.layerName, {
        docVersion: ctx.docVersion,
        mode: 'incremental',
      });
    default:
      throw new Error(`The CDN inspector cannot preview resource ${resourceId}.`);
  }
}

function buildPreview(): Promise<void> {
  if (!lastAccess) {
    throw new Error('Click "Fetch /v1/access" first so the inspector has a cdn block to apply.');
  }
  const resourceId = els.previewResource.value as DocResourceId;
  const docId = els.previewDocId.value.trim();
  if (!docId) throw new Error('Enter a doc id.');
  const ctx = {
    docId,
    layerName: els.previewLayer.value.trim() || 'default',
    pageObjectNumber: Number(els.previewPon.value) || 1,
    docVersion: Number(els.previewDocVer.value) || 1,
    layoutVersion: Number(els.previewDocVer.value) || 1,
    metadataVersion: Number(els.previewDocVer.value) || 1,
    actionsVersion: Number(els.previewActionsVer.value) || 1,
    contentVersion: Number(els.previewContentVer.value) || 1,
    annotationVersion: Number(els.previewAnnotVer.value) || 1,
  };
  const path = exampleRequestPath(resourceId, ctx);
  // applyCdnAccess lives in @embedpdf/engine-core/wire — same function
  // the cloud SDK's HttpClient calls on every fetch. The smoke calls
  // it directly so the preview matches what the SDK actually does.
  const preview = applyCdnAccess({
    path,
    originUrl: config.originBaseUrl,
    docId: ctx.docId,
    layerName: ctx.layerName,
    cdn: lastAccess.cdn,
  });
  els.cdnPreviewOutput.textContent = JSON.stringify(
    {
      requestedResource: resourceId,
      resolvedResourceId: preview.resourceId,
      originPath: path,
      originUrl: `${config.originBaseUrl}${path}`,
      finalUrl: preview.url,
      routedToCdn: preview.routedToCdn,
      fallbackReason: preview.fallbackReason || undefined,
      matchedPolicy: preview.matchedPolicy,
      authHeader: preview.authHeader,
      cookies: preview.cookies,
    },
    null,
    2,
  );
  return Promise.resolve();
}

function renderCdnAdapter(cdn: AppConfig['cdn']): void {
  els.cdnAdapterKind.textContent = cdn.kind;
  els.cdnAdapterInfo.innerHTML = '';
  for (const [k, v] of Object.entries(cdn.info)) {
    const row = document.createElement('div');
    row.innerHTML = `<span>${k}</span><strong>${escapeHtml(JSON.stringify(v))}</strong>`;
    els.cdnAdapterInfo.append(row);
  }
}

function renderAccess(access: AccessResponse): void {
  // Effective scope chips
  els.cdnEffectiveScope.innerHTML = `<span class="cdn-scope-label">effectiveScope:</span> ${
    access.effectiveScope.length === 0
      ? '<em>(empty)</em>'
      : access.effectiveScope.map((s) => `<code>${escapeHtml(s)}</code>`).join(' ')
  }`;

  // baseUrlOverrides table
  const overridesBody = els.cdnBaseOverrides.querySelector('tbody');
  if (overridesBody) {
    overridesBody.innerHTML = '';
    const entries = Object.entries(access.cdn.baseUrlOverrides ?? {});
    if (entries.length === 0) {
      overridesBody.innerHTML =
        '<tr><td colspan="2"><em>(none — every request stays on origin)</em></td></tr>';
    } else {
      for (const [resourceId, origin] of entries) {
        const row = document.createElement('tr');
        row.innerHTML = `<td><code>${escapeHtml(resourceId)}</code></td><td><code>${escapeHtml(String(origin))}</code></td>`;
        overridesBody.append(row);
      }
    }
  }

  // signedPathPolicies table
  const policiesBody = els.cdnPathPolicies.querySelector('tbody');
  if (policiesBody) {
    policiesBody.innerHTML = '';
    const policies = access.cdn.signedPathPolicies ?? [];
    if (policies.length === 0) {
      policiesBody.innerHTML =
        '<tr><td colspan="2"><em>(none — adapter uses cookies, authHeader, or global signedQueryParams instead)</em></td></tr>';
    } else {
      for (const policy of policies) {
        const row = document.createElement('tr');
        row.innerHTML = `<td><code>${escapeHtml(policy.pathPrefix)}</code></td><td><pre class="cdn-cell-json">${escapeHtml(
          JSON.stringify(policy.queryParams, null, 2),
        )}</pre></td>`;
        policiesBody.append(row);
      }
    }
  }

  // Extras block — cookies, authHeader, global query params, expiry
  els.cdnExtras.textContent = JSON.stringify(
    {
      adapter: access.cdn.adapter,
      expiresAt: access.cdn.expiresAt,
      cache: access.cdn.cache,
      authHeader: access.cdn.authHeader,
      signedQueryParams: access.cdn.signedQueryParams,
      signedCookies: access.cdn.signedCookies,
    },
    null,
    2,
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
}
