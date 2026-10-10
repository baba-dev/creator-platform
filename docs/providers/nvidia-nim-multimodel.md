# NVIDIA NIM multi-model integration

## Scope

The NVIDIA provider now supports the existing structured reasoning pathway
(Nemotron 3 Nano Omni) and standard **text-only** chat completions for the nine
curated TEXT entries in `packages/providers/src/nvidia/models.ts`. The same
durable TEXT-job admission, idempotency, workspace authorization, credit
reservation, and price snapshot settlement used by Groq/Gemini applies.

The shared NVIDIA adapter deliberately sends only the broadly compatible
`model`, `messages`, `temperature`, `max_tokens`, and `stream` fields for chat.
JSON replies are requested through system instruction and validated locally.
This avoids hardcoded Nano Omni `top_k` and thinking arguments breaking other
endpoints. Output must contain a nonempty assistant message; missing provider
usage is treated as **unknown**, not zero usage.

### Free trials are NOT production licenses

The hosted free NVIDIA Build endpoints are for trial/evaluation. NVIDIA's
[API Trial Terms](https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf)
do not authorize commercial production use. Availability in NVIDIA Build does
not mean the organization's API key is entitled to invoke every model.

NVIDIA text execution has three independent admission gates:

1. `NVIDIA_API_KEY` and `NVIDIA_COMMERCIAL_USE_ENABLED=true` must be configured
   in **web and generation worker** environments. The commercial flag defaults
   to false; set it only after a suitable NVIDIA/commercial endpoint agreement
   or otherwise properly licensed hosting has been verified.
2. The newly synced ProviderModel rows start **disabled**. An admin must
   explicitly activate each model. The admin API refuses activation of NVIDIA
   TEXT models without the commercial flag.
3. An administrator must publish a **real, non-zero** production provider cost
   and valid `text-token-v1` per-million-token usage rates in Admin > Models
   before enabling. Promotional/free trial credits must not be used as a
   permanent provider cost.

Do not change the existing Nano Omni reasoning default. The availability flag
for TEXT models does not prevent existing REASONING prompt enhancement.

### Operator runbook

1. Verify NVIDIA NIM endpoint terms and the selected model IDs/entitlements.
   NVIDIA may return 401, 403, 404 or 429 even when `GET /models` succeeds.
2. Set `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, and after commercial approval,
   `NVIDIA_COMMERCIAL_USE_ENABLED=true` in both web and worker.
3. Deploy the same application SHA to web and worker.
4. Admin > Models > Sync models (new NVIDIA rows remain disabled).
5. Publish a model-specific TOKEN price with `text-token-v1` rates and realistic
   output pricing, then activate exactly the approved models.
6. Run a live private low-cost smoke test per activated model: ordinary chat,
   JSON, three-turn history, 429 handling, missing usage, wallet debit/refund,
   Pixel model listing, and Character Chat conversation refresh. Disable any
   model that fails, and verify billing against the provider statement.
7. Verify production `/api/health` and deployment SHA after CI and rollout.

### Not silently supported

Vision inputs, embeddings, reranking, moderation, translation, function/tool
calling and streaming require distinct validated contracts and accounting. Even
if a listed upstream model has multimodal ability, its integration is limited to
text messages until those contracts are implemented. Tool execution must
continue through the app's independently authorized specialist tools.

### CI validation

`packages/providers/test/nvidia-chat.test.ts` verifies the catalog, chat
payload, usage capture, JSON validation, output sanitization and fail-closed
model validation. `apps/web/src/lib/provider-readiness.test.ts` verifies the
licensing gate and Nano Omni backwards compatibility. CI's four required lanes
remain static, test, build-release, browser-smoke, followed by quality.
