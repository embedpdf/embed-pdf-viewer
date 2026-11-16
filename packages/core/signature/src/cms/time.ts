/**
 * A time as CMS and X.509 write one. Both have the same rule (RFC 5652 for a signing time,
 * RFC 5280 for a certificate's dates): UTCTime for the years 1950 to 2049, which is all its
 * two digits of a year can say, and GeneralizedTime outside them. Neither carries a fraction
 * of a second there.
 */
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

function fitsUtcTime(date: Date): boolean {
  const year = date.getUTCFullYear();
  return year >= 1950 && year <= 2049;
}

function toTheSecond(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

/** A time as an attribute of a CMS carries it. */
export function cmsTime(date: Date): asn1js.UTCTime | asn1js.GeneralizedTime {
  const value = toTheSecond(date);
  return fitsUtcTime(value)
    ? new asn1js.UTCTime({ valueDate: value })
    : new asn1js.GeneralizedTime({ valueDate: value });
}

/** A time as a certificate, or a list of withdrawn certificates, carries it. */
export function x509Time(date: Date): pkijs.Time {
  const value = toTheSecond(date);
  return new pkijs.Time({ type: fitsUtcTime(value) ? 0 : 1, value });
}
