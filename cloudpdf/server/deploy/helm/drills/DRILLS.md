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
(health probes from inside the cluster) → config-change upgrade
(asserts the checksum annotation rolls the pod) → an abrupt kill of the
server process → asserts the container restarted and the pod returned
to Ready, printing the recovery time.

Why an abrupt SIGKILL from the node rather than `kill -SEGV` in the
pod: **pid 1 in a container only receives signals it has handlers
for** — the kernel silently discards a SIGSEGV sent to pid 1, from
inside the pod and from the node alike. (The same rule is why the
Docker docs recommend `--init`, which demotes node off pid 1 and makes
real segfault semantics observable there.) SIGKILL from the node's
namespace always delivers, and to the supervisor an abrupt kill is
indistinguishable from a native crash: no drain, no cleanup, exit
without warning. The drills target exactly one pod's process via
crictl on the kind node.

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
document, and continuous request load. One replica's server process
gets an abrupt kill mid-load (see the pid-1 note above). The script prints a timeline:

```
crash (abrupt kill, native-equivalent) t+0s
crashed pod ready again              t+Ns   (restartCount=1)
requests during window               T total, F failed
committed data after crash           intact
```

How to read it, honestly:

- **No fleet-wide outage** — the surviving replica keeps serving; `F`
  counts only requests that were in flight on the dead pod or raced the
  LB's endpoint update. This is NOT "zero downtime" for those requests.
- **Zero data loss** — committed writes are protected by the write-generation fence;
  the seed document survives every run.
- **MTTR** — with engine-host isolation enabled, this drill verifies
  that a native crash costs a sub-second engine respawn while the API
  stays available — rerun it and compare the timeline.

Postgres and MinIO here are pinned **drill dependencies**, not chart
dependencies — the chart stays BYO-database, as documented.
