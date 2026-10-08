# MediaKit tools

The workspace MediaKit Tools page is available at `/app/:slug/media-tools` and
uses the same durable execution queue as the Spokesperson finishing tools. Users
select canonical workspace asset IDs; arbitrary input URLs and provider callback
fields are rejected. Private reference inputs remain restricted to the uploading
user. Provider access uses short-lived grants bound to the execution and
snapshotted source asset.

## Pricing configuration

Sync the registry at `/admin/tools`, publish a price, then enable each tool. Use
integer micro-USD, 1 credit per baisa, and the desired gross margin. Published
versions, including resolution tariffs, are immutable.

These are the public BytePlus list rates checked on 2026-10-08. Costs below are
provider rates; customer credits are calculated from the FX and margin snapshot.

| Tool                            | Metric        | Unit quantity |         Provider micro-USD per unit | Prorate |
| ------------------------------- | ------------- | ------------: | ----------------------------------: | ------- |
| Image Compression               | INPUT_BYTE    |    1073741824 |                               10000 | Yes     |
| Image Crop                      | INPUT_BYTE    |    1073741824 |                               10000 | Yes     |
| Image Pixelation                | INPUT_BYTE    |    1073741824 |                               10000 | Yes     |
| Image Watermark                 | INPUT_BYTE    |    1073741824 |                               10000 | Yes     |
| Intelligent Image Compression   | REQUEST       |             1 |                                  18 | No      |
| Face Blur                       | REQUEST       |             1 |                                 216 | No      |
| Video Lip Sync                  | OUTPUT_SECOND |            60 |                              680000 | Yes     |
| Semantic Video Segmentation     | INPUT_SECOND  |            60 |                                7100 | Yes     |
| Video Quality Assessment        | INPUT_SECOND  |            60 |                               20000 | Yes     |
| Video Smoothness Enhancement    | INPUT_SECOND  |            60 |     300000 repair / 30000 detection | Yes     |
| Portrait / Green Screen Matting | OUTPUT_SECOND |            60 | 1200000 maximum, with tariffs below | Yes     |
| Text to Scrolling Video         | OUTPUT_SECOND |            60 |   12600 maximum, with tariffs below | Yes     |

Basic image processing is based on original bytes processed per invocation.
BytePlus includes the first 10 TiB per account per month free, then charges USD
0.01/GiB. The platform price above uses the paid-tier ceiling because the
provider account's shared free-tier consumption is not available to the
application. It does not promise to pass that account-wide promotion through per
workspace. Record this explicitly in the price basis note.

| Resolution ceiling | Matting micro-USD/minute | Scrolling micro-USD/minute |
| ------------------ | -----------------------: | -------------------------: |
| 360p               |                        — |                       2100 |
| 480p               |                        — |                       3150 |
| 720p               |                   300000 |                       6300 |
| 1080p              |                   450000 |                      12600 |
| 1440p              |                   900000 |                          — |
| 2160p              |                  1200000 |                          — |

Matting includes lower resolutions in the 720p ceiling. Provider labels `2k` and
`4k` map to 1440p and 2160p. Unsupported or missing output resolution requires
operator review; the application does not invent a tariff.

New proportional video prices settle using provider duration in milliseconds.
Legacy versions retain their existing rounded-second block behavior. All money
calculations use integers, with upward rounding at micro-USD and credit
boundaries.

## Reservations and saved results

Matting reserves against the maximum resolution rate and source duration. Lip
sync reserves against the driving audio duration (the default provider mode can
shorten output to the shorter source). Scrolling layout is provider-owned: the
reservation uses a conservative ceiling of one page per Unicode code point, plus
entry/exit pages and holds. This ceiling is shown before submission; settlement
uses the actual output duration and resolution, releasing unused credits.
Shorter texts and faster page scrolling reduce the reservation.

Image and video outputs have quota reservations before submission. The worker
validates their signatures and saves them in canonical tenant storage before
capturing credits. Segmentation downloads its bounded gzip JSON result,
validates and stores the timeline in the execution, and exposes only saved
timestamps. Provider success is persisted before output download. Storage
retries recover that result without submitting another provider task.

Execution IDs and recent jobs survive page navigation. Missing usage, invalid
outputs, exhausted recovery or usage exceeding the reservation enter manual
review with credits reserved. Failed provider tasks release credits and pending
storage reservations atomically.

Current source support: PNG/JPEG/WebP images up to 35 MiB; MP4/MOV videos up to
100 MiB with trusted duration; MP4 for lip sync and MP3/WAV driving audio. Image
outputs are PNG, except compression tools preserve JPEG output. The existing
Asset Library handles uploads and downloads. Matting offers WebM with alpha and
MP4 with a solid background.

## Official references

- [AI MediaKit pricing](https://docs.byteplus.com/en/docs/byteplus-vod/ai-mediakit-pricing)
- [Basic image editing](https://docs.byteplus.com/en/docs/byteplus-vod/ai-mediakit-basic-image-editing)
- [Video matting](https://docs.byteplus.com/en/docs/byteplus-vod/ai-mediakit-video-matting)
- [Text-to-scrolling video](https://docs.byteplus.com/en/docs/byteplus-vod/ai-mediakit-text-to-scrolling-video)
- [Semantic segmentation task](https://docs.byteplus.com/en/docs/byteplus-vod/ai-mediakit-create-a-semantic-segmentation-task)
