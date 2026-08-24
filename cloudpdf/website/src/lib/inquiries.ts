const COUNTRY_CODES =
  `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(
    ' ',
  );

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export const countries = COUNTRY_CODES.map((code) => ({
  code,
  name: regionNames.of(code) ?? code,
})).sort((left, right) => left.name.localeCompare(right.name));

export function required(form: FormData, name: string): string {
  return String(form.get(name) ?? '').trim();
}

export function optional(form: FormData, name: string): string {
  return required(form, name);
}

export function readUtmParameters(search: string): Record<string, string> {
  const query = new URLSearchParams(search);
  const result: Record<string, string> = {};
  for (const key of ['source', 'medium', 'campaign', 'term', 'content'] as const) {
    const value = query.get(`utm_${key}`)?.trim();
    if (value) result[key] = value.slice(0, 200);
  }
  return result;
}

export async function responseMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  return body?.message ?? fallback;
}
