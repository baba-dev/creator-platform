# Multi-provider prompt enhancement

Image, Video and Speech Studio can improve a user prompt through the task-aware
reasoning pipeline before the user submits media generation. Prompt Enhance is
an assistive editing step: it does not queue media generation and does not
reserve or capture workspace credits.

## Model discovery

Prompt Enhance uses the shared Studio task taxonomy. A model is offered only
when all of the following are true:

- the model is enabled;
- it has an active immutable price version;
- its provider runtime credentials are configured;
- its media kind is accepted by the `prompt-enhancement` task;
- it explicitly supports `task:prompt-enhancement`.

Verified catalog models currently include:

- NVIDIA Nemotron 3 Nano Omni;
- Groq GPT-OSS 120B;
- Gemini 3.8 Flash;
- Cloudflare Llama 3.3 70B FP8 Fast.

Cloudflare's model remains a TEXT model for ordinary Studio text workflows. It
is accepted by Prompt Enhance only because the verified catalog explicitly
grants that task capability. Generic text/chat models are not treated as
reasoning models automatically.

The catalog default remains NVIDIA Nemotron when it is eligible. If it is not
available, discovery deterministically exposes the remaining configured models.
The UI sends the canonical `ProviderModel.id`; legacy upstream IDs are accepted
only when they resolve uniquely.

## Admission and provenance

The HTTP route no longer depends on `NVIDIA_API_KEY` specifically. It discovers
the requested task model and the admission transaction revalidates
authorization, provider readiness, task capability, enabled state and the exact
active price version before queueing.

Each new `ReasoningJob` pins:

- one canonical `ProviderModel`;
- one immutable `ModelPriceVersion`;
- the task and target media;
- an estimated provider cost;
- the provider/model/price snapshot in the audit trail.

Idempotency is bound to the prompt, target media and model. Reusing the same
request key cannot switch providers. A model that is disabled after queueing is
failed explicitly; the worker never substitutes another provider.

Historical reasoning jobs remain readable with a null price-version reference.

## Provider cost observability

Prompt Enhance remains uncharged to the workspace. Pricing exists to measure
platform provider cost and to keep provider activation deliberate.

Reasoning price versions support:

- `REQUEST`: fixed configured provider cost per enhancement;
- `TOKEN`: `text-token-v1` input/output token rates.

For token pricing, admission records a conservative cost estimate. Successful
settlement uses provider-reported input and output tokens when available.
NVIDIA, Groq and Gemini expose token usage through their OpenAI-compatible
responses; the Cloudflare adapter normalizes Workers AI `result.usage`. Missing
or unusable token telemetry does not discard a successful enhancement: the job
succeeds with `USAGE_UNAVAILABLE` cost basis and no invented actual cost.

Provider-cost micro-USD fields are returned only to platform roles with
`payments:read`. The creator-facing status includes the exact provider and model
used, token usage, and output, but not commercial cost internals.

## Durable lifecycle

1. The web route validates trusted origin, authentication, active organization
   membership and `generation:create` permission.
2. Existing idempotent jobs are returned before fresh discovery, so a retry can
   retrieve its original result even if catalog availability changed.
3. New jobs resolve an eligible task model and active price snapshot.
4. Admission locks membership, rechecks authorization and the exact selected
   model/price, then applies the 3-active and 60-per-hour abuse limits.
5. A durable `ReasoningJob` and audit event are committed before provider I/O.
6. The worker claims the job and uses only its pinned provider/model.
7. Definite retryable provider responses may retry according to queue policy;
   unknown outcomes are not silently switched to another provider.
8. Successful output is validated to a non-empty `enhancedPrompt` of at most
   2000 characters for images/video or 4096 characters for spoken narration, and saved with provider request ID, token usage and cost
   basis.
9. Studio replaces the prompt and displays the provider/model that produced it.

A worker crash that leaves a job in `PROCESSING` retains the existing
interruption policy; the dispatcher does not blindly replay an unknown provider
outcome.

## Admin pricing

Reasoning models can publish REQUEST or TOKEN provider-cost snapshots. TOKEN
pricing uses `text-token-v1` for NVIDIA, Groq, Gemini and Cloudflare. The admin
UI explicitly labels reasoning pricing as internal cost observability and shows
the workspace customer charge as uncharged.

Publishing a new price version does not rewrite historical jobs. Newly admitted
jobs pin the new immutable version.

## Deployment verification

After applying the reasoning-cost migration and restarting web/worker services:

1. Open Admin → Models and confirm desired Prompt Enhance models are enabled,
   actively priced, and show runtime Ready.
2. For token-priced reasoning models, confirm input/output rates use
   `text-token-v1`.
3. Open the top-right user menu → Prompt Enhance Model and confirm the selector
   lists only eligible configured models.
4. Set a model in this menu, then open Image, Video and Speech Studio. All use the
   chosen model without showing a model selector next to the prompt.
5. In Speech Studio, Enhance Prompt polishes only the speakable narration and preserves the voice editor limit. Ask Pixel to show or change the Prompt Enhance model; verify the setting
   persists for this user and workspace across reloads.
6. Enhance the same prompt with two different providers and confirm each job
   reports the exact selected provider/model.
7. Confirm the resulting prompt is replaced without any workspace credit
   reservation or capture.
8. For a finance-capable account, confirm estimated/actual provider cost and
   cost basis appear in the status response; ordinary users must not receive
   those commercial fields.
9. Disable a selected model after queueing and confirm the pinned job fails
   rather than switching to another provider.
10. Remove one provider's credentials and confirm it disappears from fresh
    discovery while prior idempotent jobs remain retrievable.
