# Video editor rollout

The Video page now has a saved, source-linked timeline editor alongside
generation. A user can upload MP4, MP3 or WAV media (100 MB, up to 120 seconds),
add existing library videos and speech audio, trim and split clips, reorder
them, mute source audio, add an entrance fade, layer narration and a soundtrack,
and burn manually timed captions in English, Arabic, Hindi or Urdu. Rendering
creates a new MP4 asset and preserves its sources. Drafts use optimistic
revisions; a render freezes one revision and tracks its source asset IDs. Saved
caption drafts can also be downloaded as UTF-8 SRT or WebVTT sidecars; save
changes before exporting. Subtitle export is restricted to the draft owner. The
derivative worker extracts a bounded four-frame contact sheet for videos and a
static waveform for audio. Both are private asset variants served with the same
membership and source-owner checks as posters. The library grid uses those
variants instead of downloading original media.

Video links use `VIDEO_IMPORT_ALLOWED_HOSTS`, a comma-separated list of trusted
exact HTTPS hostnames. Redirects, private or IP literal hosts, overlarge
responses, unsupported files and unapproved hosts are rejected. Imported media
is private to its owner. Arbitrary YouTube URLs are not importable; users can
upload media they have rights to use or use a configured direct media host.

The generation form supports optional first and last image frames or one library
MP4 as a reference for a new BytePlus Seedance clip. These source roles are
mutually exclusive. Sources are validated in the organization and linked to the
generation job and output. Reference-video admission requires a READY local MP4,
2–30 seconds, within provider size/dimension limits and the source owner's
permissions. Video edit and extension modes are separate work.

`/api/provider-media/[assetId]` streams a reference to BytePlus through a
time-limited, job-and-asset-scoped grant. A valid HMAC alone is insufficient:
the asset must be a recorded input of the active generation job, belong to the
same organization, remain READY and respect private reference ownership. It
supports GET, HEAD and a single byte range, and stops serving after job
completion or cancellation. The worker issues a grant only after admission; no
customer-facing API issues grants. Set `APP_URL` to a provider-reachable HTTPS
origin and never log grant query strings. Install the checked-in Nginx
configuration and reload it before publishing video-input rates; its dedicated
provider-media location suppresses request logging so the grant query string is
not written to the origin logs. Review upstream/CDN logging policies for the
same URL.

Reference-video pricing is available only after an administrator publishes a new
immutable video price version with both 720p and 1080p input rates in micro-USD
per 1,000 completion tokens. The quote reserves a 30-second output envelope with
a 25% token-estimate buffer, using the verified source duration; the final
charge uses `usage.completion_tokens` and the price snapshot, capped at the
disclosed reservation. Unused credits return through the existing capture
ledger. If BytePlus succeeds without a valid token count, the job enters manual
review with credits reserved. Operators must reconcile the provider invoice; the
customer is never charged from a guessed token count.

## Deployment

1. Apply the Prisma migration `20260929020000_video_editor` before starting the
   new web or worker images. It adds saved edits, render jobs and source links,
   and updates the Seedance capability metadata. Migration
   `20260929040000_media_inspection_variants` adds storyboard and waveform
   variant kinds. The derivative worker backfills existing assets. Migration
   `20260929050000_video_input_rates` adds nullable immutable price-version
   rates and advertises the Seedance reference capability; it remains hidden in
   Studio until both rates are published.
2. Install FFmpeg and FFprobe on both web and worker hosts. The bare-metal
   Ubuntu staging host needs the `ffmpeg` apt package before deployment;
   `creator-deploy` checks both executables before migrations. The production
   Docker images include them; the worker image also includes Noto fonts for
   caption rendering. Keep both processes on a shared, writable
   `ASSET_STORAGE_ROOT`. The production Compose file mounts `asset-data` at the
   default path in both containers.
3. Set `VIDEO_IMPORT_ALLOWED_HOSTS` only to hosts that serve direct video files
   under your control. Leave it empty to disable link import.
4. Publish both video-input token rates after checking the provider contract,
   and verify the resulting maximum quote with a 2-second and a 30-second source
   at 720p and 1080p. Check successful usage-based refund and a missing-usage
   manual review with real provider credentials.
5. Verify a short upload, a private imported clip, an edit with two clips and an
   audio track, a captioned render, download, another member's denied access to
   private sources, storage quota reconciliation, and retries after a worker
   restart.

The editor is bounded to 120 seconds of source playback, 1080p output and a 300
MB render reservation. Render jobs retry three times, then release reserved
storage and mark the output deleted. Automatic transcription and translation,
provider video edit or extension, and conversational follow-up remain separate
work.
