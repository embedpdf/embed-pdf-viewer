/**
 * The server side of signing in a browser: the routes a web page reaches a timestamp
 * authority and certificate authorities through. They speak the Fetch API (`Request` in,
 * `Response` out), so they run on any server that does.
 */
export {
  revocationRoute,
  type RevocationRouteCache,
  type RevocationRouteOptions,
  type RevocationRouteRefusal,
} from './server/revocation-route';
export { timestampRoute, type TimestampRouteOptions } from './server/timestamp-route';
export type { HostLookup } from './server/public-address';
export type { RevocationRouteRequest } from './revocation/http-source';
