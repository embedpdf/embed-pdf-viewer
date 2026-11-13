import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
