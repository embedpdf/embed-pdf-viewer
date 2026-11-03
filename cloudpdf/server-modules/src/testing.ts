/**
 * `@cloudpdf/server-modules/testing`: test a module in a real server, the
 * `@cloudpdf/server` you deploy, with its native engine. The server runs on a
 * license key like any other: a development key.
 */
import { buildApp, createLicenseRuntime } from '@cloudpdf/server';

import { launchTestServer, type TestServer, type TestServerOptions } from './test-server';

/**
 * Start a server with `options.modules` mounted, on `127.0.0.1` and a free
 * port. Throws what the server would stop with when a module is wrong, and
 * when there's no valid license key.
 */
export async function startTestServer(options: TestServerOptions): Promise<TestServer> {
  const licenseKey = options.licenseKey ?? process.env['CLOUDPDF_LICENSE_KEY'];
  if (!licenseKey) {
    throw new Error(
      'startTestServer needs a development license key: set CLOUDPDF_LICENSE_KEY or pass licenseKey',
    );
  }
  return launchTestServer(options, async (db) => {
    const license = await createLicenseRuntime({ db, env: { CLOUDPDF_LICENSE_KEY: licenseKey } });
    const status = license.getStatus();
    if (status.access !== 'full') {
      await license.close();
      throw new Error(
        `startTestServer: the license key doesn't run a server: ${status.message} (${status.code})`,
      );
    }
    return {
      build: (app) => buildApp({ ...app, license }),
      close: () => license.close(),
    };
  });
}

export type { TestDocument, TestRequestInit, TestServer, TestServerOptions } from './test-server';
