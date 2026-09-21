# NVIDIA prompt enhancement

Studio can optionally enhance an image prompt through the NVIDIA reasoning
provider before the user submits the image-generation request. Prompt
enhancement is an assistive editing step: it never queues a BytePlus generation
and does not reserve or capture wallet credits.

## Provider

The default hosted model is `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`
through NVIDIA's OpenAI-compatible `/v1/chat/completions` endpoint.

The adapter uses the model's instruct-mode settings for this short structured
task:

- `temperature: 0.2`
- `top_k: 1`
- `max_tokens: 1024`
- `stream: false`
- thinking disabled for prompt enhancement

The system prompt requests one JSON object containing only `enhancedPrompt`.
Provider output is still parsed and validated server-side; the application does
not trust model formatting.

## Environment

Worker and web services require:

```env
NVIDIA_API_KEY=...
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_REASONING_MODEL=nvidia/nemotron-3-nano-omni-30b-a3b-reasoning
NVIDIA_REQUEST_TIMEOUT_MS=60000
```

`NVIDIA_REASONING_MODEL` is optional and defaults to the verified model above.
The configured model must also exist as an enabled `NVIDIA / REASONING`
`ProviderModel` with the `task:prompt-enhancement` capability.

Remote NVIDIA base URLs must use HTTPS. Plain HTTP is accepted only for
localhost development endpoints.

## Durable job lifecycle

1. The web route authenticates the user, verifies trusted mutation origin,
   current active organization membership and `generation:create` permission.
2. The request is idempotent per user and client UUID. Reusing a key with
   different inputs returns 409.
3. Abuse controls allow at most 3 active jobs and 60 prompt-enhancement jobs per
   user/workspace/hour.
4. A `ReasoningJob` and audit event are committed before provider execution.
5. The worker atomically claims `QUEUED -> PROCESSING`, then rechecks current
   workspace access before contacting NVIDIA.
6. Definite transient HTTP responses such as 429/5xx may be retried once.
   Network/timeout failures have an unknown provider outcome and are not
   automatically replayed.
7. Successful output is validated to a non-empty prompt of at most 2000
   characters and persisted with token usage and provider request ID.
8. A worker crash that leaves a job in `PROCESSING` does not cause blind
   provider replay. After five minutes the job is marked failed so Studio can
   create an explicit new attempt.

## Privacy and observability

User prompts, system prompts, provider response bodies and API keys must not be
written to application logs. Worker logs may contain job ID, attempt count,
sanitized error class/message, model ID and provider request ID.

The status API requires both the original creator and current active workspace
access. Removing the user from the organization therefore revokes access to the
reasoning output.

## Deployment verification

After the migration and worker restart:

1. Confirm the default NVIDIA model exists and is enabled in `ProviderModel`.
2. Enter a short image prompt in Studio and choose **Enhance prompt**.
3. Confirm the job transitions `QUEUED -> PROCESSING -> SUCCEEDED`.
4. Confirm Studio replaces the text with the enhanced prompt without generating
   an image.
5. Confirm the reasoning job records provider request ID and token counts.
6. Generate the final image and verify the normal BytePlus wallet reservation,
   storage and capture pipeline remains unchanged.
7. Test an invalid/disabled NVIDIA key and confirm Studio receives a sanitized
   failure without provider response details in logs.
