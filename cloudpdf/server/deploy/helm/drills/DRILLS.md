# Crash drills

Recovery behavior as a number, not a slide. Both scripts build a
throwaway kind cluster and destroy it on exit (`KEEP=1` to keep it).
Prereqs: `docker`, `kind`, `helm`, `kubectl` — and a license key: the
server is fail-closed, so `CLOUDPDF_LICENSE_KEY` must be set for any
drill that actually boots it (a development key is fine).

## smoke.sh — the install gate

```bash
CLOUDPDF_LICENSE_KEY=... ./smoke.sh
```

Fresh cluster → empty-namespace install (default profile) → `helm test`
(readyz/license probes from inside the cluster) → config-change upgrade
(asserts the checksum annotation rolls the pod) → `kill -SEGV 1` in the
container (byte-identical to a native PDFium crash as far as the
supervisor is concerned) → asserts the container restarted and the pod
returned to Ready, printing the recovery time.

Without a license key it degrades to **license-boundary mode**: install
mechanics, image pull, env/secret wiring, and an assertion that the
server fail-closes exactly as designed (exit code 2, license message).
CI runs this mode on every chart PR; set the `CLOUDPDF_DEV_LICENSE_KEY`
repo secret to upgrade CI to the full path.

## crash-drill.sh — the resilience evidence

```bash
CLOUDPDF_LICENSE_KEY=... ./crash-drill.sh
```

The 2-replica Postgres + MinIO profile with the migrate hook, a seeded
document, and continuous request load. One replica gets `SIGSEGV` on
pid 1 mid-load. The script prints a timeline:

```
crash (SIGSEGV, native-equivalent)   t+0s
crashed pod ready again              t+Ns   (restartCount=1)
requests during window               T total, F failed
committed data after crash           intact
```

How to read it, honestly:

- **No fleet-wide outage** — the surviving replica keeps serving; `F`
  counts only requests that were in flight on the dead pod or raced the
  LB's endpoint update. This is NOT "zero downtime" for those requests.
- **Zero data loss** — committed writes are durable (the WS1 fence);
  the seed document survives every run.
- **MTTR** — today a native crash costs one whole pod for ~15–45 s.
  When engine-host isolation (WS3 Phase A) lands, this same drill is
  the proof that the number drops to a sub-second engine respawn with
  the API untouched — rerun it, diff the timeline.

Postgres and MinIO here are pinned **drill dependencies**, not chart
dependencies — the chart stays BYO-database, as documented.
