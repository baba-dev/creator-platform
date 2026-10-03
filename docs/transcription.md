# Speech transcription and subtitles

The Speech Studio exposes transcription as a separate workflow from text-to-speech.
The initial production provider is Groq Whisper Large v3 Turbo.

## Discovery and pricing

Transcription uses the shared `transcription` Studio task. A model appears only
when it is enabled, actively priced, runtime-configured, has VOICE media kind,
and explicitly advertises transcription capability.

VOICE pricing is task-aware:

- speech synthesis: CHARACTER or REQUEST;
- transcription: SECOND or REQUEST.

The admin API validates that distinction both when a price version is published
and when a model is enabled. A Whisper model cannot accidentally inherit
character pricing, and a TTS model cannot accidentally use duration pricing.

For SECOND pricing, the provider cost is configured per `unitQuantity` seconds.
Quotes and final settlement derive billable duration from trusted probed Asset
metadata, not from browser input or provider-reported duration.

## Durable lifecycle

Transcription reuses `GenerationJob`, the generation wallet ledger, History,
and Assets rather than creating a parallel job system.

1. The creator selects or uploads a READY AUDIO/VIDEO Asset.
2. The quote endpoint resolves the canonical transcription model and exact
   immutable price version.
3. Source size and trusted `durationMs` are validated server-side.
4. A signed quote binds model, price, source Asset, optional language, and
   billable duration.
5. Admission locks the organization, rechecks generation permission, project,
   source media, active price and wallet budget.
6. Credits and three output storage reservations are committed before queueing.
7. The worker claims the job and routes only transcription tasks to Groq
   Whisper; ordinary VOICE jobs continue to use BytePlus TTS.
8. The source object is read through the Asset storage abstraction, so LOCAL,
   Google Drive and OneDrive-backed source assets follow the same access rules.
9. Provider success is normalized into transcript text, SRT, and WebVTT.
10. TXT/SRT/VTT are durably stored as DOCUMENT Assets linked to both the
    GenerationJob and source Asset.
11. The final transaction captures credits, converts storage reservations into
    physical usage, records actual provider cost from trusted duration, marks
    all output Assets READY, and completes the job.
12. History and the Speech Studio expose the resulting documents for download.

## Safety and recovery

Source files are limited to 25 MB for the initial Groq path. The ordinary media
upload endpoint may support larger files for other product features, but
transcription admission and quoting reject them.

Definite provider rejection releases the wallet and pending storage reservation.
An uncertain provider outcome moves the job to MANUAL_REVIEW and is never
automatically resubmitted, preventing duplicate transcription charges.

Once Whisper has returned successfully, storage failures also move the job to
MANUAL_REVIEW rather than calling the provider again. Partially written output
objects are removed. If the final database commit loses its state race, newly
written objects are removed, pending document storage is released, and a
PROCESSING job is moved to MANUAL_REVIEW instead of being stranded.

Queued job cancellation now releases pending Asset storage reservations before
zeroing/deleting the placeholder Assets. This correction applies to existing
generation workflows as well as transcription.

## Output contract

A successful job writes up to three generated DOCUMENT assets:

- `Transcript.txt` — UTF-8 plain text;
- `Subtitles.srt` — SubRip captions;
- `Subtitles.vtt` — WebVTT captions.

When the provider does not supply timestamped segments, the system produces a
single full-duration subtitle cue using the trusted source duration. This keeps
all three output contracts available without inventing word-level timestamps.

The GenerationJob output payload stores task, transcript text, detected
language when available, provider duration, trusted source duration, segment
count and output Asset IDs. Provider/model provenance remains available through
the canonical ProviderModel relation.

## Deployment checks

1. In Admin → Models, publish SECOND or REQUEST pricing for Groq Whisper Large
   v3 Turbo and enable it.
2. Confirm its Runtime column is Ready and its Available in column contains
   Transcription.
3. Open Speech → Transcribe & subtitles.
4. Select or upload an MP3, WAV or MP4 source under 25 MB.
5. Confirm the estimate reflects trusted media duration.
6. Submit and verify the job progresses through Generation History.
7. Download TXT, SRT and VTT outputs and verify their filename extensions.
8. Confirm the three documents appear in Assets and link back to the generation
   job/source lineage.
9. Cancel a queued test job and verify credits and reserved storage are both
   released.
10. Disable Whisper after queueing a test job and confirm it fails without
    silently routing to TTS or another provider.
