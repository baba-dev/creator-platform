# Generation system audit — 23 September 2026

## Scope and evidence

Reviewed Studio admission and display, quote and model capabilities, image,
video, and voice adapters, BullMQ dispatch, persistent jobs, reservations,
storage, recovery, reconciliation, and the staging deployment workflow. The
BytePlus references are the
[ModelArk image guide](https://docs.byteplus.com/en/docs/ModelArk/1824121),
[video task retrieval](https://docs.byteplus.com/en/docs/ModelArk/1521309),
[ModelArk burst traffic guidance](https://docs.byteplus.com/en/docs/modelark/handle_burst_traffic),
and
[Seed Speech TTS](https://docs.byteplus.com/en/docs/byteplusvoice/texttospeechv2).

| Path               | Current behavior                                                                          | This change                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Image              | Reserve, submit once, persist output URL, download validated PNG, capture or enter review | Release a definite configuration failure; prevent stale worker failure from overriding operator review |
| Video              | Reserve, submit once, persist task ID, poll, validate MP4, capture or enter review        | Guard definite failure against concurrent operator reconciliation                                      |
| Voice              | Reserve, synthesize once, validate MP3, persist, capture or enter review                  | The same guarded failure transition applies to voice                                                   |
| Studio             | Capability driven model controls, quotes, status and authorized downloads                 | Explain review and retain request idempotency after a successful submission when history refresh fails |
| Prompt enhancement | Separate NVIDIA reasoning queue and failure state                                         | Reviewed, no changes in this patch                                                                     |

## Fixed findings

1. **Credit release race:** `failJob` could release an unsettled reservation
   after an operator had moved the job into manual review, based on a worker's
   earlier observation. It now takes an expected source state and checks that
   state under the job row lock before posting any ledger entry or changing an
   asset. A stale failed video poll is covered by a regression test.
2. **Misconfigured worker:** a missing ModelArk credential is a definite
   preflight failure. Image and video jobs now release their reservations, as
   voice jobs already did, instead of holding credits for an outcome that never
   reached BytePlus.
3. **Ambiguous Studio refresh:** after a `202` admission, a failed history
   refresh could make a subsequent click create a second request. Studio keeps
   the idempotency key until the accepted job is visible, and explains that
   retrying the same inputs returns the same job.
4. **Manual review explanation:** the job card now states that credits remain
   reserved and an operator needs to check the provider outcome. It uses
   existing warning and foreground tokens in both themes.

## Remaining operational boundaries

- An ambiguous synchronous image or voice submission cannot safely be
  resubmitted. It needs provider evidence and the admin reconciliation flow.
  This is intentional protection against a second billable request.
- Provider generated-media URLs are temporary. BytePlus documents a 24-hour
  retention window for image URLs and video output; the worker must continue
  running, shared storage must be writable and backed up, and manual review
  should be handled promptly. The image recovery deadline is also 24 hours,
  leaving little margin at the boundary; shorten it after measuring production
  retry behavior.
- The repository deploy workflow targets the **staging** environment on a
  successful CI push to `main`. A merge does not prove live customer generation
  or deployment to a distinct production host. Perform a funded image, video,
  and voice acceptance test after deployment and reconcile ledger entries and
  stored assets. Never make paid provider calls in CI.
- Integration tests that require MariaDB and Redis run in CI. Unit tests alone
  cannot prove the deployed server's credentials, provider entitlement, quota,
  CDN access, filesystem permissions, or media playback.

## Release verification

Run the required repository checks and inspect CI. After staging activates the
merge SHA, verify `/api/health`, then create one funded image, video and voice
job in Studio; confirm ready previews, downloads, one reservation and capture
per job, and no held credits after a definite rejection. Test an operator review
case using evidence, without blindly resubmitting it.
