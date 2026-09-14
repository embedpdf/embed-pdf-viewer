#!/usr/bin/env python3
"""Promote reviewed Acrobat observations into engine policy expectations.

An expectation is a decision, never an engine output: every entry below was
reviewed against the observation record and states how the engine's
modification verdict relates to what Acrobat displayed. The corpus test
(`packages/core/signature/test/compatibility-corpus.test.ts`) enforces them and
compares every other case against the frozen engine baselines, so a policy
change shows up as an explicit edit here, never as silent drift.

    python promote_expectations.py            # rewrites policy-expectations.json
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
POLICY_VERSION = 4  # the engine policy the review was made against

MATCHES = 'matches-observed-behavior'
STRICTER = 'intentional-stricter-policy'
ENGINE = 'engine-specific-definition'

# id -> (modifications per signature, relationship, rationale)
REVIEW = {
    # ---- controls: nothing after the signature ------------------------------
    **{cid: (['unchanged'], MATCHES, 'Unchanged control: the signature seals the last revision.')
       for cid in ['01', '22', '31', '32', '33', '35', '38', '40', '48', '53', '58', '63', '72', '78', '89']},
    '29': (['unchanged'], ENGINE,
           'The tampered bytes fail the integrity check, which is judged separately from modifications; '
           'no revision follows the signature, so there is nothing to judge as a modification.'),
    # ---- forbidden, Acrobat invalid -----------------------------------------
    '13': (['forbidden'], MATCHES, 'Renaming a field is a structure change; Acrobat reports it as a field deleted and a field added.'),
    '14': (['forbidden'], MATCHES, 'Signed page content changed.'),
    '25': (['forbidden'], MATCHES, 'P=1 certification permits nothing; a fill invalidates it.'),
    '28': (['forbidden'], MATCHES, 'A field locked by the signature was filled.'),
    '34': (['forbidden'], MATCHES, 'A glyph used only by signed page content changed.'),
    '36': (['forbidden'], MATCHES, 'A glyph used by signed page content changed; registering the font in /DR does not permit it.'),
    '41': (['forbidden'], MATCHES, 'Under P=2 a fill whose font also draws signed page content is rejected.'),
    '43': (['forbidden', 'unchanged'], MATCHES, 'The first signature sees its page changed; the second seals the changed page and nothing follows it.'),
    '45': (['forbidden'], MATCHES, 'A restored page whose decoded stream bytes differ (an added comment) is a changed page.'),
    '46': (['forbidden'], MATCHES, 'The page stream was restored but the glyph it draws with stays changed.'),
    '50': (['forbidden'], MATCHES, 'Under P=2 moving a field (/Rect) is not form fill-in.'),
    '51': (['forbidden'], MATCHES, 'Hiding a locked field (/F) is a change to the locked field.'),
    '66': (['forbidden'], MATCHES, 'Under P=2 a tooltip (/TU) change is not form fill-in.'),
    '67': (['forbidden'], MATCHES, 'Under P=2 hiding a field (/F) is not form fill-in.'),
    '69': (['forbidden', 'unchanged'], MATCHES, 'Under P=2 the second signature\'s /Lock and /TU on its field are not form fill-in; the second signature seals the last revision.'),
    '73': (['forbidden'], MATCHES, 'A locked field\'s default appearance (/DA) changed.'),
    '74': (['forbidden'], MATCHES, 'A locked field\'s tooltip (/TU) changed.'),
    '80': (['forbidden'], MATCHES, 'A locked field was filled.'),
    '82': (['forbidden'], MATCHES, 'Signed page content changed under a certification.'),
    '83': (['forbidden'], MATCHES, 'A certification replays every revision after it: the page change of revision 1 invalidates it even though revision 2 restored the page (Acrobat: invalid on reopen and explicit revalidation).'),
    '84': (['forbidden', 'unchanged'], MATCHES, 'The first signature\'s locked field was filled; the second seals that state and nothing follows it.'),
    '85': (['permitted', 'permitted'], MATCHES,
           'Each signature is judged against the revision it sealed. SignatureOne: its locked field holds the sealed value '
           'again and a second signature was added in between (Acrobat: valid, "not modified"). SignatureTwo declares no lock, '
           'so the restoring fill in its window is an ordinary fill (Acrobat: valid, "Form Fields Filled In").'),
    '86': (['forbidden'], MATCHES, 'A text field was added after an approval signature ("Form Fields Added").'),
    '87': (['forbidden'], MATCHES, 'A text field was deleted after an approval signature ("Form Fields Deleted").'),
    # ---- permitted, Acrobat valid with changes -------------------------------
    '08': (['permitted'], MATCHES, 'An ordinary fill (/V and /AP) after an approval signature.'),
    '17': (['permitted', 'unchanged'], MATCHES, 'A second approval signature after the first; the second seals the last revision.'),
    '26': (['permitted'], MATCHES, 'A fill under P=2 certification.'),
    '27': (['permitted'], MATCHES, 'An annotation change under P=3 certification.'),
    '37': (['permitted'], MATCHES, 'A fill with its own font; the page font is untouched.'),
    '65': (['permitted'], MATCHES, 'Under P=2 a default-appearance (/DA) change is accepted as form fill-in.'),
    '68': (['permitted'], MATCHES, 'Under P=2 an appearance stream rewritten with the same value and drawing is accepted.'),
    '88': (['permitted'], MATCHES, 'A Square annotation added after an approval signature ("Annotations Created"): commenting is allowed.'),
    '90': (['permitted'], MATCHES, 'A Square annotation deleted after an approval signature ("Annotations Deleted").'),
    '91': (['permitted'], MATCHES, 'A Square annotation recoloured after an approval signature ("Annotations Modified").'),
    # ---- identical and value-identical rewrites: no effective change ------------
    **{cid: (['unchanged'], ENGINE,
             'An object written again with the sealed value is not a modification; Acrobat reports the revision as '
             '"not altered" with "subsequent changes", we report no effective change.')
       for cid in ['02', '03', '04', '05', '06', '07', '23']},
    **{cid: (['unchanged'], MATCHES, 'Identical rewrite(s) of the page and/or the sealed widget: Acrobat "not modified".')
       for cid in ['47', '54', '55', '56', '57', '59', '60']},
    **{cid: (['unchanged'], MATCHES, 'A dictionary reserialised with reordered keys and different whitespace holds the same value: Acrobat "not modified".')
       for cid in ['61', '62']},
    **{cid: (['unchanged'], ENGINE, 'An identical rewrite under a P=2 certification: Acrobat "permitted changes", we report no effective change.')
       for cid in ['70', '71']},
    '77': (['unchanged'], MATCHES, 'A locked field rewritten identically: Acrobat "not modified".'),
    # ---- restoration: judged on the net state ----------------------------------
    '15': (['unchanged'], ENGINE, 'The page changed and was byte-restored later; the current document equals the sealed one (Acrobat: valid, "subsequent changes").'),
    '42': (['permitted', 'unchanged'], MATCHES, 'The page was changed and restored before the second signature; the first signature sees only the second signature added.'),
    '44': (['permitted', 'forbidden'], MATCHES, 'Restoring the page recovers the first signature (it sees a second signature added over its sealed page) and takes the second signature\'s changed page away.'),
    '81': (['unchanged'], MATCHES, 'The locked field was filled and its dictionary byte-restored: the sealed value holds again (Acrobat "not modified").'),
    # ---- approval-level property changes -----------------------------------------
    '09': (['permitted'], MATCHES, 'ReadOnly added on its own after an approval signature.'),
    '10': (['permitted'], MATCHES, 'A field moved (/Rect) after an approval signature ("Form Fields with Property Changes").'),
    '11': (['permitted'], MATCHES, 'A field hidden (/F) after an approval signature ("Form Fields with Property Changes").'),
    '16': (['permitted'], MATCHES, 'A fill whose appearance font, with indirect descendants, is shared with /AcroForm /DR: every use of the font is a permitted one.'),
    '18': (['permitted', 'unchanged'], MATCHES, 'The tooltip (/TU) of the field being signed changed with the second signature.'),
    '19': (['permitted', 'unchanged'], MATCHES, 'A /Lock installed on the field with the second signature.'),
    '20': (['permitted', 'unchanged'], MATCHES, 'The second signature\'s value carries indirect /Prop_Build children.'),
    '21': (['permitted', 'unchanged'], MATCHES, 'Staged fills with ReadOnly and /DA, fonts shared with /DR, an identical /Info rewrite, then a second signature with a lock and a tooltip change.'),
    '24': (['permitted', 'unchanged'], MATCHES, 'Case 21 with AES-128 encryption.'),
    '64': (['permitted'], MATCHES, 'ReadOnly added on its own under a P=2 certification ("permitted changes").'),
    '76': (['permitted'], ENGINE, 'ReadOnly added on a field locked by the signature: the one change a lock tolerates (Acrobat "not modified"; we report a permitted change).'),
    # ---- intentional stricter policy: Acrobat accepts, we do not ---------------
    '12': (['forbidden'], STRICTER, 'Acrobat accepts a validation action (/AA) added to a signed form field; an action on a signed form is executable content and stays forbidden.'),
    '30': (['forbidden'], STRICTER, 'Acrobat accepts a fill whose changed glyph also draws signed page content, which visibly changes the page; a changed resource must be permitted by every use, and the page\'s use is not.'),
    '39': (['forbidden'], STRICTER, 'Acrobat reports "not modified" although the field/page-shared glyph changes both; same rule as 30.'),
    '52': (['forbidden'], STRICTER, 'Case 30 without the Square annotation; same rule as 30.'),
    '79': (['forbidden'], STRICTER, 'Acrobat accepts a fill whose changed glyph also draws a locked field\'s appearance; the locked field\'s use of the resource denies the change.'),
    '49': (['forbidden'], STRICTER, 'Acrobat accepts moving a field covered by the signature\'s own FieldMDP lock; a locked field that can move is not the guarantee the lock promises.'),
    '75': (['forbidden'], STRICTER, 'Acrobat accepts a locked field\'s appearance stream rewritten with the same drawing; an appearance change on a locked field can misrepresent its value and the drawing is not verified.'),
}


def main() -> None:
    fixtures = {}
    for directory in ('v1', 'v2', 'v3'):
        for case in json.loads((HERE / directory / 'manifest.json').read_text())['cases']:
            fixtures[case['id']] = case
    observations = json.loads((HERE / 'observations.json').read_text())
    run_of = {}
    for run in observations['runs']:
        for case in run['cases']:
            if case.get('status') == 'observed':
                run_of[case['id']] = (run['id'], case)
    entries = []
    for cid in sorted(REVIEW, key=int):
        modifications, relationship, rationale = REVIEW[cid]
        fixture = fixtures[cid]
        run_id, observed = run_of[cid]
        assert observed['sha256'] == fixture['facts']['sha256'], cid
        assert len(modifications) == len(fixture['facts']['signatures']), cid
        if relationship == STRICTER:
            for verdict, signature in zip(modifications, observed['signatures']):
                status = (signature.get('overallStatus') or '').lower()
                assert verdict == 'forbidden' and 'valid' in status and 'invalid' not in status, (cid, status)
        entries.append({
            'id': cid,
            'sha256': fixture['facts']['sha256'],
            'observationRunId': run_id,
            'policyVersion': POLICY_VERSION,
            'relationship': relationship,
            'modifications': modifications,
            'rationale': rationale,
        })
    (HERE / 'policy-expectations.json').write_text(json.dumps({'schemaVersion': 1, 'entries': entries}, indent=2) + '\n')
    print(f'{len(entries)} expectations written')


if __name__ == '__main__':
    main()
