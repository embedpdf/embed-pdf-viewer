"""Verify frozen investigation evidence without modifying it."""

import argparse
import csv
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parent


def verify_hash(path, expected):
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != expected:
        raise ValueError(f"SHA-256 mismatch: {path}: {actual} != {expected}")


def verify_cms(paths):
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(ROOT.parent))
    from asn1crypto import cms
    from generate import reader

    count = 0
    with tempfile.TemporaryDirectory(prefix="epdf-evidence-") as temporary:
        signature_path = Path(temporary) / "signature.der"
        content_path = Path(temporary) / "signed.bin"
        for path in paths:
            data = path.read_bytes()
            signatures = reader(data).embedded_signatures
            if not signatures:
                raise ValueError(f"No signatures: {path}")
            for signature in signatures:
                ranges = list(map(int, signature.sig_object["/ByteRange"]))
                if len(ranges) != 4 or ranges[0] != 0:
                    raise ValueError(f"Unexpected ByteRange: {path}: {ranges}")
                if not (0 <= ranges[1] <= ranges[2] <= ranges[2] + ranges[3] <= len(data)):
                    raise ValueError(f"Out-of-bounds ByteRange: {path}: {ranges}")
                content = b"".join(
                    data[ranges[index]:ranges[index] + ranges[index + 1]]
                    for index in range(0, len(ranges), 2)
                )
                encoded = signature.sig_object["/Contents"].original_bytes
                signature_path.write_bytes(cms.ContentInfo.load(encoded).dump())
                content_path.write_bytes(content)
                result = subprocess.run(
                    ["openssl", "cms", "-verify", "-inform", "DER", "-in",
                     str(signature_path), "-content", str(content_path),
                     "-binary", "-noverify", "-out", str(Path(temporary) / "verified.bin")],
                    capture_output=True, text=True,
                )
                if result.returncode:
                    raise ValueError(f"CMS verification failed: {path}: {result.stderr}")
                count += 1
    print(f"OpenSSL verified {count} signatures; certificate trust was not evaluated.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cms", action="store_true", help="Also verify signed bytes with OpenSSL and pinned Python dependencies.")
    options = parser.parse_args()

    pdfs = set()
    for folder in ["pdfs", "supplemental", "p3-matched", "reference"]:
        manifest = json.loads((ROOT / folder / "manifest.json").read_text())
        for case in manifest["cases"]:
            path = ROOT / folder / case["file"]
            verify_hash(path, case["facts"]["sha256"])
            if path.stat().st_size != case["facts"]["byteLength"]:
                raise ValueError(f"Byte length mismatch: {path}")
            pdfs.add(path)
    if pdfs != set(ROOT.rglob("*.pdf")):
        raise ValueError("PDF inventory does not match the manifests")

    observations = json.loads((ROOT / "acrobat-observations.json").read_text())["cases"]
    screenshots = set()
    for case in observations:
        path = ROOT / case["file"]
        if path not in pdfs:
            raise ValueError(f"Observation has no manifested PDF: {path}")
        verify_hash(path, case["sha256"])
        screenshot = ROOT / case["screenshot"]
        verify_hash(screenshot, case["screenshotSha256"])
        screenshots.add(screenshot)
    if screenshots != set((ROOT / "acrobat-evidence").glob("*.png")):
        raise ValueError("Screenshot inventory does not match observations")

    with (ROOT / "acrobat-checklist.csv").open(newline="") as handle:
        checklist = list(csv.DictReader(handle))
    for case in checklist:
        verify_hash(ROOT / case["file"], case["sha256"])

    sources = json.loads((ROOT / "experiment-source/manifest.json").read_text())
    for source in sources:
        verify_hash(ROOT / "experiment-source" / source["file"], source["sha256"])

    print(f"Verified {len(pdfs)} PDF files, {len(observations)} observations, "
          f"{len(screenshots)} screenshots, {len(checklist)} checklist rows and "
          f"{len(sources)} archived source files.")
    if options.cms:
        verify_cms(sorted(pdfs))


if __name__ == "__main__":
    main()
