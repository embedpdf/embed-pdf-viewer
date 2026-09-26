#!/usr/bin/env node
/**
 * Enforces docs/conventions/comments.md on every TypeScript source file.
 *
 * Comments are read through the TypeScript parser (never by regex over code),
 * then checked for references a reader cannot follow: plans, phases,
 * decisions, internal section numbers, missing `.md` files, version history,
 * issue-less TODOs, and ALL-CAPS emphasis.
 *
 *   node scripts/check-comments.mjs            # fail on any finding
 *   node scripts/check-comments.mjs --summary  # counts per rule and package
 *   node scripts/check-comments.mjs packages/plugin/form   # limit to paths
 *
 * Exceptions live in scripts/check-comments.allow, one per line:
 *   <path prefix> :: <regular expression matched against the comment line> :: <reason>
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const summary = args.includes('--summary');
const scopes = args.filter((arg) => !arg.startsWith('--'));
const defaultScopes = ['packages', 'cloudpdf'];
const skipDirectories = new Set([
  'node_modules',
  'dist',
  'build',
  '.turbo',
  '.next',
  '.svelte-kit',
  'runtime-src',
  'generated',
]);

/** Acronyms and spec terms that are not emphasis. */
const ACRONYMS = new Set(
  (
    'PDF PDFs API APIs DOM URL URLs URI URIs JSON HTML CSS SVG UTF ISO RFC HTTP HTTPS CMS XML FDF XFDF ' +
    'UUID UUIDs AABB OBB CTM TODO WASM ESM CJS AST SSE JWT JWTs HMAC SHA RGB RGBA CMYK ASCII IO UI UX TLS ' +
    'OCSP CRL CRLs LTV DSS VRI ID IDs MIME XFA CID TTF OTF WOFF NFC NFD RTL LTR JS TS CDN SDK SDKs FIFO LIFO ' +
    'LRU GPU CPU EOF BOM AP DA BS BE LE RD CL QT RC DS WC WS DP WP AA OCG KB MB GB GC OK CI PR IDE CLI OS ' +
    'NM IRT RT IT IC CA BM DR DV MK FT FF TU TM AS OC UA GUID PKCS PEM DER ASN OID OIDs TSA TSR CAdES PAdES ' +
    'ETSI AES RSA ECDSA EC HSM KMS PIN CSP CORS REST RPC SQL DB UTC GMT WYSIWYG NaN SPA SSR CSR DPR DPI PPI ' +
    'PX PT VP IME ARIA WCAG USB RAF N A B C D E F G H I J K L M O P Q R S T U V W X Y Z II III IV XY RGB8 ' +
    'NAPI N-API NPM PNPM CJK BIDI EXIF JPEG JPG PNG GIF BMP WEBP TIFF ICC HDR MDN W3C WHATWG ECMA ES ESNext ' +
    'TTL CSV TSV XLSX DOCX SMTP SSO SAML OIDC OAuth IP IPv4 IPv6 DNS TCP UDP GPU2 VM VMs JIT AOT CSSOM ' +
    'KiB MiB GiB XHR SW PWA POSIX ENV CWD PID TTY SIGTERM SIGKILL RAM ROM NVM LTS EOL ' +
    'GET POST PUT PATCH DELETE HEAD OPTIONS SSE CRUD ACL ACLs RBAC IAM MFA OTP TOTP JWK JWKS CSRF XSS ' +
    'EPDF FPDF FXJS AcroForm AcroJS ENOENT EACCES EPERM ESRCH EOF NUL CRLF LF CR BOT ' +
    'DTO DTOs CW CCW GCS SAS AWS CAS RSS FS LS UE LE US SE NW NE SW TL TR BL BR PG FD ADC KEK ABI GCP ' +
    'AAD USCIS FK IPC EMBD AFD DDL PK SSRF IRSA MDX ESS DI DRM LB DIY CGNAT ULA GA NB AF SAT PKI TLV ' +
    'OCR XOR OOM PII PHP FYI RPS CSPRNG SPKI NNN VCL AEAD IETF TSAN ARN KDF WAF NAT README CGROUP AD SC ' +
    'SELECT INSERT UPDATE INTEGER BIGINT UNIQUE NULL TABLE CREATE CONFLICT TEXT LISTEN NOTIFY ' +
    'FCL RS ES ULID TOC SH SB GKE GCE REALPATH AWSPROD AES GCM ' +
    'CTA FNV XYZ VPC JSONL MPU YYYY MM MVCC WAL RDS AATL XHTML SOF NFKD BSD BGRA UCS CPVT FQN CAFE'
  ).split(/\s+/),
);

const RULES = [
  {
    id: 'plan-reference',
    test: (line) =>
      /\b(Phase[- ]?\d|phase \d|WS-?\d|WP\d|umbrella|road-?to-?3|docs\/plans|the plan\b|the review\b|landing \d|round \d)/i.test(
        line,
      ) || /\b[DG]\d{1,2}\b(?![-.]\d)/.test(line),
    message: 'references a plan, phase, decision or gate',
  },
  {
    id: 'section-number',
    test: (line) => {
      const index = line.indexOf('§');
      if (index < 0) return false;
      for (let at = index; at >= 0; at = line.indexOf('§', at + 1)) {
        const before = line.slice(Math.max(0, at - 48), at);
        if (!/(ISO|PDF|RFC|32000|Table|spec|Acrobat|JavaScript|AcroJS|ECMA)/.test(before)) return true;
      }
      return false;
    },
    message: 'cites an internal section number (only ISO/PDF/RFC sections may be cited)',
  },
  {
    id: 'history',
    test: (line) =>
      /\b(v2|v3|v4)(\b|['’]s)(?!\/)/.test(line.replace(/\/v\d\//g, '')) ||
      /\b(the old (mistake|way|bug)|used to|as before|exactly as before|interim|for now)\b/i.test(line),
    message: 'narrates history or versions instead of current behavior',
  },
  {
    id: 'todo-without-issue',
    test: (line) => /\b(TODO|FIXME|XXX|HACK)\b(?!\(#\d+\))/.test(line),
    message: 'TODO without an issue number: write TODO(#123)',
  },
  {
    id: 'caps-emphasis',
    test: (line) => {
      const withoutCode = line.replace(/`[^`]*`/g, ' ').replace(/\/[A-Z][A-Za-z]*/g, ' ');
      const words = withoutCode.match(/\b[A-Z][A-Z]+\b/g) ?? [];
      return words.some((word) => !ACRONYMS.has(word) && !/\d|_/.test(word));
    },
    message: 'uses ALL-CAPS for emphasis',
  },
];

function loadAllowList() {
  const file = path.join(root, 'scripts/check-comments.allow');
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [prefix, pattern, reason] = line.split('::').map((part) => part.trim());
      if (!prefix || !pattern || !reason) throw new Error(`bad allow entry: ${line}`);
      return { prefix, pattern: new RegExp(pattern) };
    });
}

function walk(directory, files) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skipDirectories.has(entry.name) || entry.name.startsWith('.')) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx|mts|cts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(full);
  }
}

function commentsOf(file) {
  const text = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const ranges = new Map();
  const collect = (position) => {
    for (const range of ts.getLeadingCommentRanges(text, position) ?? []) ranges.set(range.pos, range);
    for (const range of ts.getTrailingCommentRanges(text, position) ?? []) ranges.set(range.pos, range);
  };
  const visit = (node) => {
    collect(node.getFullStart());
    collect(node.getEnd());
    ts.forEachChild(node, visit);
  };
  visit(source);
  collect(source.endOfFileToken.getFullStart());
  const comments = [];
  for (const range of ranges.values()) {
    const firstLine = source.getLineAndCharacterOfPosition(range.pos).line + 1;
    text
      .slice(range.pos, range.end)
      .split('\n')
      .forEach((line, offset) => comments.push({ line: firstLine + offset, text: line }));
  }
  return comments;
}

/** `.md` links must resolve to a file, relative to the source file or the repository root. */
function missingMarkdown(file, line) {
  const matches = line.match(/[\w./-]+\.md\b/g) ?? [];
  return matches.filter((reference) => {
    if (/^https?:/.test(reference)) return false;
    const candidates = [
      path.resolve(path.dirname(file), reference),
      path.resolve(root, reference),
      path.resolve(root, 'docs/conventions', reference),
    ];
    return !candidates.some((candidate) => fs.existsSync(candidate));
  });
}

const allowList = loadAllowList();
const files = [];
for (const scope of scopes.length ? scopes : defaultScopes) walk(path.resolve(root, scope), files);

const findings = [];
for (const file of files) {
  const relative = path.relative(root, file);
  for (const comment of commentsOf(file)) {
    const allowed = (rule) =>
      allowList.some(
        (entry) =>
          relative.startsWith(entry.prefix) &&
          entry.pattern.test(comment.text) &&
          (entry.rule === undefined || entry.rule === rule),
      );
    for (const rule of RULES) {
      if (rule.test(comment.text) && !allowed(rule.id)) {
        findings.push({ file: relative, line: comment.line, rule: rule.id, text: comment.text.trim() });
      }
    }
    for (const reference of missingMarkdown(file, comment.text)) {
      if (!allowed('missing-doc')) {
        findings.push({
          file: relative,
          line: comment.line,
          rule: 'missing-doc',
          text: `${reference} does not exist`,
        });
      }
    }
  }
}

if (summary) {
  const byRule = new Map();
  const byPackage = new Map();
  for (const finding of findings) {
    byRule.set(finding.rule, (byRule.get(finding.rule) ?? 0) + 1);
    const pkg = finding.file.split('/').slice(0, 3).join('/');
    byPackage.set(pkg, (byPackage.get(pkg) ?? 0) + 1);
  }
  console.log('by rule:', Object.fromEntries(byRule));
  console.log(
    'by package:',
    [...byPackage.entries()].sort((left, right) => right[1] - left[1]).map(([pkg, count]) => `${pkg} ${count}`),
  );
} else {
  for (const finding of findings) {
    console.log(`${finding.file}:${finding.line}  [${finding.rule}]  ${finding.text.slice(0, 140)}`);
  }
}
if (findings.length) {
  console.error(`\ncheck:comments: ${findings.length} finding(s). See docs/conventions/comments.md.`);
  process.exit(1);
}
