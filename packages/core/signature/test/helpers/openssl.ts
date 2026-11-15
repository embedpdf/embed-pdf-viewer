import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * OpenSSL as a second opinion: a token this package builds and verifies itself proves little
 * until a verifier that shares none of its code agrees. Continuous integration has OpenSSL, so
 * a missing binary fails there; on a machine without one the tests that need it are skipped.
 */
export const hasOpenSsl = ((): boolean => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'pipe' });
    return true;
  } catch {
    if (process.env.CI) throw new Error('openssl is required in continuous integration');
    return false;
  }
})();

/**
 * A timestamp authority run by OpenSSL: its own key and self-signed certificate, and tokens
 * made by `openssl ts -reply`. `bindingHash` is how its tokens bind the certificate: `sha1`
 * writes a `signing-certificate` attribute, the others a `signing-certificate-v2`. Call
 * `dispose()` when done; it removes the authority's files.
 */
export function createOpenSslAuthority(bindingHash: 'sha1' | 'sha256' | 'sha384' | 'sha512'): {
  /** DER of the authority's certificate. */
  certificate: Uint8Array;
  /** A token over a SHA-256 digest. */
  stamp(digest: Uint8Array): Uint8Array;
  /** The response to a request as a client sent it: what the authority's HTTP endpoint returns. */
  reply(query: Uint8Array): Uint8Array;
  dispose(): void;
} {
  const directory = mkdtempSync(join(tmpdir(), 'epdf-openssl-tsa-'));
  const run = (args: string[]) => execFileSync('openssl', args, { stdio: 'pipe', cwd: directory });
  writeFileSync(
    join(directory, 'request.cnf'),
    [
      '[ req ]',
      'distinguished_name = dn',
      'x509_extensions = ext',
      'prompt = no',
      '[ dn ]',
      'CN = OpenSSL test timestamp authority',
      '[ ext ]',
      'basicConstraints = critical, CA:FALSE',
      'keyUsage = critical, digitalSignature',
      'extendedKeyUsage = critical, timeStamping',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(directory, 'authority.cnf'),
    [
      '[ tsa ]',
      'default_tsa = authority',
      '[ authority ]',
      `dir = ${directory}`,
      'serial = $dir/serial',
      'crypto_device = builtin',
      'signer_cert = $dir/authority.pem',
      'signer_key = $dir/authority.key',
      'signer_digest = sha256',
      'default_policy = 1.2.3.4.1',
      'digests = sha256',
      'accuracy = secs:1',
      'tsa_name = no',
      'ess_cert_id_chain = no',
      `ess_cert_id_alg = ${bindingHash}`,
      '',
    ].join('\n'),
  );
  writeFileSync(join(directory, 'serial'), '01\n');
  run([
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    'authority.key',
    '-out',
    'authority.pem',
    '-days',
    '30',
    '-config',
    'request.cnf',
  ]);
  run(['x509', '-in', 'authority.pem', '-outform', 'DER', '-out', 'authority.der']);
  return {
    certificate: new Uint8Array(readFileSync(join(directory, 'authority.der'))),
    stamp(digest) {
      run([
        'ts',
        '-query',
        '-digest',
        Buffer.from(digest).toString('hex'),
        '-sha256',
        '-cert',
        '-no_nonce',
        '-out',
        'query.tsq',
      ]);
      run([
        'ts',
        '-reply',
        '-config',
        'authority.cnf',
        '-queryfile',
        'query.tsq',
        '-out',
        'token.der',
        '-token_out',
      ]);
      return new Uint8Array(readFileSync(join(directory, 'token.der')));
    },
    reply(query) {
      writeFileSync(join(directory, 'query.tsq'), query);
      rmSync(join(directory, 'response.tsr'), { force: true });
      try {
        run([
          'ts',
          '-reply',
          '-config',
          'authority.cnf',
          '-queryfile',
          'query.tsq',
          '-out',
          'response.tsr',
        ]);
      } catch {
        // OpenSSL exits with an error for a request it rejects, after writing the rejection.
      }
      return new Uint8Array(readFileSync(join(directory, 'response.tsr')));
    },
    dispose() {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

/**
 * A signer run by OpenSSL: a CMS from another library, for what must hold whoever made it. Its
 * signatures are detached, over content this helper is given, with definite lengths or, when
 * asked, the indefinite ones a streaming encoder writes. Call `dispose()` when done.
 */
export function createOpenSslSigner(): {
  /** A detached CMS over `content`. */
  sign(content: Uint8Array, options?: { indefinite?: boolean }): Uint8Array;
  /** Does OpenSSL verify `cms` as a signature over `content`? */
  verifies(cms: Uint8Array, content: Uint8Array): { ok: boolean; output: string };
  dispose(): void;
} {
  const directory = mkdtempSync(join(tmpdir(), 'epdf-openssl-signer-'));
  const run = (args: string[]) =>
    execFileSync('openssl', args, { stdio: 'pipe', cwd: directory, encoding: 'utf8' });
  run([
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    'signer.key',
    '-out',
    'signer.pem',
    '-days',
    '30',
    '-subj',
    '/CN=OpenSSL test signer',
  ]);
  return {
    sign(content, options = {}) {
      writeFileSync(join(directory, 'content.bin'), content);
      run([
        'cms',
        '-sign',
        '-binary',
        ...(options.indefinite ? ['-stream'] : []),
        '-in',
        'content.bin',
        '-signer',
        'signer.pem',
        '-inkey',
        'signer.key',
        '-outform',
        'DER',
        '-out',
        'signature.der',
      ]);
      return new Uint8Array(readFileSync(join(directory, 'signature.der')));
    },
    verifies(cms, content) {
      writeFileSync(join(directory, 'content.bin'), content);
      writeFileSync(join(directory, 'checked.der'), cms);
      try {
        // The signer's certificate is self-signed: this checks the signature, not the chain.
        run([
          'cms',
          '-verify',
          '-binary',
          '-inform',
          'DER',
          '-in',
          'checked.der',
          '-content',
          'content.bin',
          '-noverify',
          '-out',
          'verified.bin',
        ]);
        return { ok: true, output: '' };
      } catch (error) {
        const failure = error as { stdout?: string; stderr?: string; message: string };
        return { ok: false, output: `${failure.stdout ?? ''}${failure.stderr ?? failure.message}` };
      }
    },
    dispose() {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function pem(label: string, der: Uint8Array): string {
  const base64 = Buffer.from(der).toString('base64');
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

/**
 * `openssl ts -verify` over an RFC 3161 token: does it stamp `digest`, and does it chain to
 * `anchor` with a certificate that may issue timestamps? Returns what OpenSSL said either way.
 */
export function opensslVerifiesToken(input: {
  token: Uint8Array;
  digest: Uint8Array;
  anchor: Uint8Array;
}): { ok: boolean; output: string } {
  const directory = mkdtempSync(join(tmpdir(), 'epdf-openssl-'));
  try {
    const tokenFile = join(directory, 'token.der');
    const anchorFile = join(directory, 'anchor.pem');
    writeFileSync(tokenFile, input.token);
    writeFileSync(anchorFile, pem('CERTIFICATE', input.anchor));
    const output = execFileSync(
      'openssl',
      [
        'ts',
        '-verify',
        '-digest',
        Buffer.from(input.digest).toString('hex'),
        '-in',
        tokenFile,
        '-token_in',
        '-CAfile',
        anchorFile,
      ],
      { stdio: 'pipe', encoding: 'utf8' },
    );
    return { ok: /Verification: OK/.test(output), output };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message: string };
    return { ok: false, output: `${failure.stdout ?? ''}${failure.stderr ?? failure.message}` };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * A certificate authority run by OpenSSL: its own root, a responder it certified for
 * answering, the certificates it issues, and its OCSP responses and CRLs, all made by
 * `openssl ca` and `openssl ocsp`. The answers a checker meets here are ones this package's
 * code had no hand in. Call `dispose()` when done; it removes the authority's files.
 */
export function createOpenSslCertificateAuthority(): {
  /** DER of the authority's own certificate. */
  certificate: Uint8Array;
  /** Issue a certificate that names the authority's OCSP and CRL addresses. DER. */
  issue(commonName: string): Uint8Array;
  /** Issue a certificate as `issue` does, with its RSA key (PKCS #8, DER), to sign with. */
  issueSigner(commonName: string): { certificate: Uint8Array; privateKey: Uint8Array };
  /** Withdraw a certificate it issued. */
  revoke(certificate: Uint8Array, reason?: 'keyCompromise' | 'superseded'): void;
  /** The OCSP response to a request as a client sent it. `responderId`: how it names itself; by name unless said. */
  answer(request: Uint8Array, responderId?: 'name' | 'key'): Uint8Array;
  /** The CRL as it stands. DER. */
  crl(): Uint8Array;
  dispose(): void;
} {
  const directory = mkdtempSync(join(tmpdir(), 'epdf-openssl-ca-'));
  const run = (args: string[]) => execFileSync('openssl', args, { stdio: 'pipe', cwd: directory });
  const address = 'http://openssl-authority.invalid';
  writeFileSync(
    join(directory, 'ca.cnf'),
    [
      '[ ca ]',
      'default_ca = authority',
      '[ authority ]',
      `dir = ${directory}`,
      'database = $dir/index.txt',
      'new_certs_dir = $dir/issued',
      'serial = $dir/serial',
      'crlnumber = $dir/crlnumber',
      'certificate = $dir/ca.pem',
      'private_key = $dir/ca.key',
      'default_md = sha256',
      'default_days = 365',
      'default_crl_days = 7',
      'policy = any',
      'unique_subject = no',
      'copy_extensions = none',
      '[ any ]',
      'commonName = supplied',
      '[ req ]',
      'distinguished_name = dn',
      'prompt = no',
      '[ dn ]',
      'CN = OpenSSL test certificate authority',
      '[ root ]',
      'basicConstraints = critical, CA:TRUE',
      'keyUsage = critical, digitalSignature, keyCertSign, cRLSign',
      'subjectKeyIdentifier = hash',
      '[ leaf ]',
      'basicConstraints = critical, CA:FALSE',
      'keyUsage = critical, digitalSignature, nonRepudiation',
      `authorityInfoAccess = OCSP;URI:${address}/ocsp`,
      `crlDistributionPoints = URI:${address}/crl`,
      '[ responder ]',
      'basicConstraints = critical, CA:FALSE',
      'keyUsage = critical, digitalSignature',
      'extendedKeyUsage = OCSPSigning',
      'noCheck = ignored',
      '',
    ].join('\n'),
  );
  mkdirSync(join(directory, 'issued'));
  writeFileSync(join(directory, 'index.txt'), '');
  writeFileSync(join(directory, 'serial'), '1000\n');
  writeFileSync(join(directory, 'crlnumber'), '01\n');
  const key = (name: string) =>
    run([
      'genpkey',
      '-algorithm',
      'RSA',
      '-pkeyopt',
      'rsa_keygen_bits:2048',
      '-out',
      `${name}.key`,
    ]);
  key('ca');
  run([
    'req',
    '-new',
    '-x509',
    '-key',
    'ca.key',
    '-config',
    'ca.cnf',
    '-extensions',
    'root',
    '-days',
    '365',
    '-out',
    'ca.pem',
  ]);
  let issuedCount = 0;
  const issuePem = (commonName: string, extensions: 'leaf' | 'responder'): string => {
    const name = `cert-${issuedCount++}`;
    key(name);
    run([
      'req',
      '-new',
      '-key',
      `${name}.key`,
      '-subj',
      `/CN=${commonName}`,
      '-out',
      `${name}.csr`,
    ]);
    run([
      'ca',
      '-batch',
      '-config',
      'ca.cnf',
      '-extensions',
      extensions,
      '-notext',
      '-in',
      `${name}.csr`,
      '-out',
      `${name}.pem`,
    ]);
    return name;
  };
  const responder = issuePem('OpenSSL test OCSP responder', 'responder');
  const der = (file: string): Uint8Array => {
    run(['x509', '-in', file, '-outform', 'DER', '-out', `${file}.der`]);
    return new Uint8Array(readFileSync(join(directory, `${file}.der`)));
  };
  const issued = new Map<string, string>();
  const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

  return {
    certificate: der('ca.pem'),
    issue(commonName) {
      const name = issuePem(commonName, 'leaf');
      const certificate = der(`${name}.pem`);
      issued.set(hex(certificate), `${name}.pem`);
      return certificate;
    },
    issueSigner(commonName) {
      const name = issuePem(commonName, 'leaf');
      const certificate = der(`${name}.pem`);
      issued.set(hex(certificate), `${name}.pem`);
      run([
        'pkcs8',
        '-topk8',
        '-nocrypt',
        '-in',
        `${name}.key`,
        '-outform',
        'DER',
        '-out',
        `${name}.pk8`,
      ]);
      return {
        certificate,
        privateKey: new Uint8Array(readFileSync(join(directory, `${name}.pk8`))),
      };
    },
    revoke(certificate, reason = 'keyCompromise') {
      const file = issued.get(hex(certificate));
      if (!file) throw new Error('the OpenSSL authority did not issue this certificate');
      run(['ca', '-config', 'ca.cnf', '-revoke', file, '-crl_reason', reason]);
    },
    answer(request, responderId = 'name') {
      writeFileSync(join(directory, 'request.der'), request);
      run([
        'ocsp',
        '-index',
        'index.txt',
        '-CA',
        'ca.pem',
        '-rsigner',
        `${responder}.pem`,
        '-rkey',
        `${responder}.key`,
        '-reqin',
        'request.der',
        '-respout',
        'response.der',
        '-ndays',
        '1',
        ...(responderId === 'key' ? ['-resp_key_id'] : []),
      ]);
      return new Uint8Array(readFileSync(join(directory, 'response.der')));
    },
    crl() {
      run(['ca', '-config', 'ca.cnf', '-gencrl', '-out', 'crl.pem']);
      run(['crl', '-in', 'crl.pem', '-outform', 'DER', '-out', 'crl.der']);
      return new Uint8Array(readFileSync(join(directory, 'crl.der')));
    },
    dispose() {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

/** Run OpenSSL over files in a fresh directory, and return what it printed, whether it liked them or not. */
function opensslOver(
  files: Record<string, Uint8Array | string>,
  args: string[],
): { ok: boolean; output: string } {
  const directory = mkdtempSync(join(tmpdir(), 'epdf-openssl-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(directory, name), content);
    }
    const result = spawnSync('openssl', args, { cwd: directory, encoding: 'utf8' });
    return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * `openssl ocsp` over a response: does its signature lead to `issuer`, and what does it say
 * about `certificate`? `status` is OpenSSL's own word: `good`, `revoked` or `unknown`.
 * `above` is the rest of the issuer's chain, up to a root, when the issuer is not one itself.
 *
 * The question here is who signed the response and what it says, not whether it is fresh: a
 * stored answer is read years after it was made, so its dates are given all the room they need.
 */
export function opensslReadsOcspResponse(input: {
  response: Uint8Array;
  certificate: Uint8Array;
  issuer: Uint8Array;
  above?: Uint8Array[];
}): { verified: boolean; status: string | null; output: string } {
  const { output } = opensslOver(
    {
      'response.der': input.response,
      'certificate.pem': pem('CERTIFICATE', input.certificate),
      'issuer.pem': pem('CERTIFICATE', input.issuer),
      'trusted.pem': [input.issuer, ...(input.above ?? [])]
        .map((certificate) => pem('CERTIFICATE', certificate))
        .join(''),
    },
    [
      'ocsp',
      '-respin',
      'response.der',
      '-issuer',
      'issuer.pem',
      '-cert',
      'certificate.pem',
      '-CAfile',
      'trusted.pem',
      '-no_nonce',
      '-validity_period',
      '3000000000',
    ],
  );
  return {
    verified: /Response verify OK/.test(output),
    status: /certificate\.pem: (\w+)/.exec(output)?.[1] ?? null,
    output,
  };
}

/** `openssl crl`: does the list's signature verify with `issuer`, and which serial numbers does it withdraw? */
export function opensslReadsCrl(input: { crl: Uint8Array; issuer: Uint8Array }): {
  verified: boolean;
  /** The withdrawn serial numbers, in upper-case hex. */
  revoked: string[];
  output: string;
} {
  const { output } = opensslOver(
    { 'crl.der': input.crl, 'issuer.pem': pem('CERTIFICATE', input.issuer) },
    ['crl', '-inform', 'DER', '-in', 'crl.der', '-CAfile', 'issuer.pem', '-noout', '-text'],
  );
  return {
    verified: /verify OK/.test(output),
    revoked: [...output.matchAll(/Serial Number: ([0-9A-F]+)/g)].map((match) => match[1]!),
    output,
  };
}

/** `openssl ocsp -req_text`: the serial numbers a request asks about, in upper-case hex. */
export function opensslReadsOcspRequest(request: Uint8Array): {
  serials: string[];
  output: string;
} {
  const { output } = opensslOver({ 'request.der': request }, [
    'ocsp',
    '-reqin',
    'request.der',
    '-req_text',
  ]);
  return {
    serials: [...output.matchAll(/Serial Number: ([0-9A-F]+)/g)].map((match) => match[1]!),
    output,
  };
}
