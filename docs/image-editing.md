# Private image edits and link imports

The Image workspace accepts a READY organization image as a source. A crop,
resize or resample creates a separate `DERIVED` Asset with `sourceAssetId`
pointing to its source. Existing bytes and generation provenance are never
rewritten. Interpolation at 2×/4× is a deterministic resample, not AI detail
reconstruction.

`POST /api/assets/image-operations` checks origin, session, `assets:manage`,
tenant membership, source visibility and transform bounds. It requires a UUID
idempotency key. Admission reserves 25 MB of member and organization storage and
creates a PENDING output and ImageOperation in one transaction. The asset worker
finds PENDING/stale PROCESSING operations every 15 seconds, validates the source
bytes, renders with Sharp, persists the new object, finalizes storage and
records an audit event transactionally. The polling endpoint exposes only the
creator's operation. An exhausted operation releases its reservation and removes
the failed output. The original remains available.

Crop coordinates are oriented source pixels. Image dimensions are bounded to
8,192 per side and 40 million pixels; outputs must fit within 25 MB.

## Import policy

`POST /api/assets/image-import` accepts an HTTPS image URL on an exact host in
the comma-separated `IMAGE_IMPORT_ALLOWED_HOSTS` environment variable. Empty
means link import is disabled. Wildcards, literal IPs, credentials, custom ports
and redirects are rejected. The response must be JPEG, PNG or WebP, arrive
within 12 seconds and remain below 20 MB even without Content-Length. The
decoder normalizes and strips metadata before saving the image as an
owner-private `REFERENCE_INPUT` Asset. The original URL, query and downloaded
bytes are not logged or persisted. Audit records contain the approved host. Only
administrators should add trusted image delivery hosts to this allowlist.

Run Prisma migrations before starting the updated web and worker processes.
Validate a real import, crop, resize, 2× upscale, library derivative and storage
quota on staging.
