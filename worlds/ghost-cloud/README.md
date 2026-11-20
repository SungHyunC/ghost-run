# World: ghost-cloud

An in-memory, S3-compatible object store driven by AWS CLI lines. The ghost runs a plan against a copy of a fixed fixture (3 buckets, 7 objects, 3 local files). Nothing talks to AWS, a moto server, or any network.

Real mode (a local moto server with `AWS_ENDPOINT_URL=http://localhost:5000`) is **not implemented**. Nothing is claimed for it.

## The six functions

| Function | What it does here |
|---|---|
| `snapshot()` | Deep copy of the in-memory state (`buckets`, `localFiles`). Reality is not touched. |
| `step(s, a)` | Applies one action to a copy of the snapshot. Never throws and never mutates `s`. An invalid or unsupported action returns the state unchanged with `{ success: false, error }`. |
| `diff(before, after)` | Sorted, minimal `Change[]` (`kind`, `path`) over the path model below. |
| `render(s)` | Pure `Scene` of buckets, ACL, public-access-block flag, and objects. |
| `fingerprint()` | SHA-256 over a canonical encoding of the state (P1 check). |
| `effectsOutside(a)` | One `network` effect with the host of `--endpoint-url`, and `[]` for every other action. |

## Path model

| Virtual path | Meaning |
|---|---|
| `BUCKET` | a bucket |
| `BUCKET/KEY` | an object |
| `_acl/BUCKET` | the ACL of a bucket |
| `_public-access-block/BUCKET` | the public access block of a bucket |

Bucket names contain no `_`, so the two attribute prefixes never collide with a bucket. A bucket attribute is judged only while the bucket exists in both snapshots.

## Wards (`wards.yaml`)

| Ward id | Kind | Rule |
|---|---|---|
| `no-bucket-delete` | `path` | `deny: [delete]` on `prod-*` (bucket and every object below it) |
| `no-public-bucket` | `path` | `deny: [delete, overwrite]` on `_acl/prod-*` and `_public-access-block/prod-*` |

Limits of the mapping onto path wards:

1. `no-bucket-delete` denies `delete` only. Overwriting an object of a protected bucket with `aws s3 cp` is not blocked.
2. `no-public-bucket` cannot see the direction or the content of an ACL change. Every ACL value change on a protected bucket is blocked, including `public-read` back to `private`.
3. Public access counts as opened when the public-access-block path is deleted. `put-public-access-block` with any flag `false` and `delete-public-access-block` both produce `file-deleted` on `_public-access-block/BUCKET`.
4. Temporary buckets (names that do not start with `prod-`) are protected by no ward.

An action with `--endpoint-url` is rehearsed on the copy as if the option were absent. It yields `warn` through `effectsOutside`.

## Demo plans (`demo/`)

| Plan | Verdict | Cause |
|---|---|---|
| `01-delete-protected-bucket.txt` | block | `no-bucket-delete` |
| `02-make-bucket-public.txt` | block | `no-public-bucket` |
| `03-delete-temporary-bucket.txt` | pass | none |
| `04-non-copy-endpoint.txt` | warn | network effect to `s3.example` |

## Claims and non-claims

| Property | Claimed | Not claimed |
|---|---|---|
| P1 | Playground only: the ghost runs on a snapshot of an in-memory store and the fingerprint before equals the fingerprint after. No Docker is involved. | Any real store; Docker box; Plan B fallback |
| P2 | The ghost diff equals the change set of an independent Reference_Model for the same actions. | Fidelity to a real S3 service, a moto server, or any real AWS CLI run; a run with an Unsupported_Step |
| P3 | Claimed. | n/a |
| P4 | Claimed through `core` and the ward checks of `verifyWorld`. | n/a |
| P5 | Supported steps in the playground, within the limits above. | A run with an Unsupported_Step; overwrite of an object; temporary buckets |
| P6 | Not claimed. The world has no secret file and no egress ward. | All |
| P7 | Inherited from `core`. The world adds no claim of its own. | n/a |
| P8 | Not applicable. | Ghost Hand only |

A plan with an Unsupported_Step (a line outside the supported subset, or a line past the 50-line cut) is recorded and not rehearsed. Its verdict is at least `warn`, and the claims of P1, P2, and P5 are lowered in the message.

About P2: the Reference_Model is a second, independently written implementation (a flat `Map` with its own interpreter). P2 therefore tests `diff` and the copy separation of this world against that model. It is not a test of fidelity to a real S3 service.

About the P1 notice: `core` has no P1 notice kind. When the P1 check in the Pipeline_Entry fails, the world reports it as a notice of kind `observed-event`.

### Tested_Environments for P2

| Environment | Result |
|---|---|
| Node | v20.20.2 (macOS, Apple Silicon), vitest 3.2.7 |
| browser | not run yet |

## Measurements

| Run | `numRuns` per property | Time |
|---|---|---|
| Short_Run, whole package (16 test files, 108 tests) | 100 | 9.19 s test duration, 10.47 s wall; `verifyWorld` call 1.5 s |
| Nightly_Run (`GHOST_PBT_MODE=nightly`) | 10,000 | 33.45 s test duration, 33.96 s wall (108 tests passed); `verifyWorld` call 34.9 s |

The Short_Run is inside the 55 s save-time budget. Property 17 (negative control) runs 100 examples per case in both modes, because the shrink of a failing gate at 10,000 examples did not finish in over an hour. The same entry is in `docs/measurements.md`.

## Checklist

- [x] All six functions implemented
- [x] `snapshot()` leaves reality unchanged (P1)
- [x] `step()` does not mutate the input snapshot
- [x] `diff()` covers every change type of this world
- [x] `effectsOutside()` is non-empty for every action with `--endpoint-url`
- [x] `actionArb` defined for `tests/contract.test.ts`
- [x] P1, P2, P3, and the ward properties pass
- [x] Wards of this world written in `wards.yaml`
