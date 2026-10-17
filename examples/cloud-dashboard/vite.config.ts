import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const apiPort = Number(process.env['CLOUDPDF_SMOKE_API_PORT'] ?? 3211);
const enginePort = Number(process.env['CLOUDPDF_SMOKE_ENGINE_PORT'] ?? 3210);
const https = process.env['CLOUDPDF_DEV_HTTPS'] === '1';

export default defineConfig({
  plugins: [
    simulatedLatency(),
    // `/api` is this demo's own admin helper (token minting, uploads, shares);
    // `/v1` is the real @cloudpdf/server. Same-origin through the dev server, so
    // the browser talks to the engine with `baseUrl: ''` — the shape a
    // production app behind a reverse proxy actually uses.
    sameOriginProxy({ '/api/': apiPort, '/v1/': enginePort }),
    react(),
    tailwindcss(),
  ],
  server: {
    ...(https ? { https: localCertificate() } : {}),
  },
});

/**
 * Hold every `/v1` request for a while before it reaches the server, so the
 * viewer can be judged at a real-world round trip instead of localhost's ~0 ms.
 *
 * Each request waits `ms + random() * jitter` milliseconds. Jitter lets
 * responses come back in a different order than their requests, which is the
 * case optimistic UI has to survive.
 *
 * Start with `CLOUDPDF_LATENCY_MS=500` (and optionally `CLOUDPDF_LATENCY_JITTER_MS`),
 * or change it live with `GET /__latency?ms=500&jitter=200`. With no query, the
 * endpoint returns the current setting. The demo's top bar has a picker for it.
 *
 * The event stream's connect is delayed too, but its later messages are not.
 */
function simulatedLatency(): Plugin {
  const latency = {
    ms: Number(process.env['CLOUDPDF_LATENCY_MS'] ?? 0),
    jitter: Number(process.env['CLOUDPDF_LATENCY_JITTER_MS'] ?? 0),
  };
  const nonNegative = (value: string | null) => Math.max(0, Number(value) || 0);

  return {
    name: 'cloud-dashboard:simulated-latency',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://dev.local');

        if (url.pathname === '/__latency') {
          if (url.searchParams.has('ms') || url.searchParams.has('jitter')) {
            if (url.searchParams.has('ms')) latency.ms = nonNegative(url.searchParams.get('ms'));
            if (url.searchParams.has('jitter')) {
              latency.jitter = nonNegative(url.searchParams.get('jitter'));
            }
            server.config.logger.info(
              `[latency] /v1 now waits ${latency.ms} ms` +
                (latency.jitter ? ` + up to ${latency.jitter} ms jitter` : ''),
              { timestamp: true },
            );
          }
          res.setHeader('content-type', 'application/json');
          res.setHeader('cache-control', 'no-store');
          res.end(JSON.stringify({ ...latency, http2: https }));
          return;
        }

        if (!url.pathname.startsWith('/v1/') || latency.ms + latency.jitter <= 0) return next();

        // The browser may cancel it meanwhile (a tile scrolled out of view).
        let cancelled = false;
        res.once('close', () => (cancelled = true));
        const delay = latency.ms + Math.random() * latency.jitter;
        setTimeout(() => {
          if (!cancelled) next();
        }, delay);
      });
    },
  };
}

/** Headers that describe one connection, so they never cross a proxy. */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
  'http2-settings',
]);

/**
 * Forward path prefixes to local servers. This does what `server.proxy` would,
 * but Vite falls back from HTTP/2 to HTTP/1.1 whenever `server.proxy` is set.
 * Over HTTP/1.1 the browser keeps at most six requests open to one origin, so
 * with latency switched on, renders and writes would queue behind each other in
 * a way they don't in production.
 */
function sameOriginProxy(targets: Record<string, number>): Plugin {
  const agent = new http.Agent({ keepAlive: true });

  return {
    name: 'cloud-dashboard:same-origin-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const prefix = Object.keys(targets).find((p) => req.url?.startsWith(p));
        if (!prefix) return next();

        const headers: http.OutgoingHttpHeaders = {};
        for (const [name, value] of Object.entries(req.headers)) {
          if (!name.startsWith(':') && !HOP_BY_HOP.has(name)) headers[name] = value;
        }
        // HTTP/2 carries the host as `:authority`. Pass it through unchanged,
        // as `server.proxy` does by default.
        const authority = req.headers[':authority'];
        headers['host'] = typeof authority === 'string' ? authority : req.headers.host;

        let answered = false;
        const upstream = http.request(
          {
            host: '127.0.0.1',
            port: targets[prefix],
            method: req.method,
            path: req.url,
            headers,
            agent,
          },
          (response) => {
            const out: http.OutgoingHttpHeaders = {};
            for (const [name, value] of Object.entries(response.headers)) {
              if (!HOP_BY_HOP.has(name) && value !== undefined) out[name] = value;
            }
            res.writeHead(response.statusCode ?? 502, out);
            response.once('end', () => (answered = true));
            response.pipe(res);
          },
        );

        upstream.on('error', (error) => {
          if (res.headersSent) {
            res.destroy();
            return;
          }
          res.writeHead(502, { 'content-type': 'text/plain' });
          res.end(`Proxy to 127.0.0.1:${targets[prefix]} failed: ${error.message}`);
        });
        // An abandoned request (a tile scrolled away, a closed event stream)
        // must not keep the upstream one open.
        res.once('close', () => {
          if (!answered) upstream.destroy();
        });

        req.pipe(upstream);
      });
    },
  };
}

/**
 * A certificate for 127.0.0.1 and localhost, signed by the local mkcert CA, so
 * the browser trusts it and Vite can serve HTTP/2. Made once under `.data/`.
 */
function localCertificate() {
  const dir = resolve(import.meta.dirname, '.data/certs');
  const cert = resolve(dir, 'cert.pem');
  const key = resolve(dir, 'key.pem');
  if (!existsSync(cert) || !existsSync(key)) {
    mkdirSync(dir, { recursive: true });
    try {
      execFileSync('mkcert', ['-cert-file', cert, '-key-file', key, '127.0.0.1', 'localhost'], {
        stdio: 'inherit',
      });
    } catch {
      throw new Error(
        'CLOUDPDF_DEV_HTTPS=1 needs mkcert (`brew install mkcert && mkcert -install`).',
      );
    }
  }
  return { cert: readFileSync(cert), key: readFileSync(key) };
}
