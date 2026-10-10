import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { RecentCreationsRefresh } from "@/components/dashboard/recent-creations-refresh";
import { creationPrompt } from "@/lib/recent-creations";

type MediaKind = "IMAGE" | "VIDEO" | "VOICE";
type Asset = { id: string; mimeType: string; variants: { kind: string }[] };
export type RecentCreation = {
  id: string;
  status: string;
  createdAt: Date;
  chargedCredits: string;
  reservedCredits: string;
  requestPayload: unknown;
  modelName: string;
  mediaKind: MediaKind;
  asset: Asset | null;
};

function preview(asset: Asset | null, kind: MediaKind) {
  if (!asset) return null;
  const variants = new Set(asset.variants.map((v) => v.kind));
  const wanted = kind === "IMAGE" ? "THUMBNAIL" : kind === "VIDEO" ? "POSTER" : "WAVEFORM";
  return variants.has(wanted) ? `/api/assets/${encodeURIComponent(asset.id)}/variant/${wanted.toLowerCase()}` : null;
}

export function RecentCreations({ jobs, organizationId, organizationSlug }: {
  jobs: RecentCreation[];
  organizationId: string;
  organizationSlug: string;
}) {
  const history = `/app/${organizationSlug}/history`;
  return (
    <section aria-labelledby="recent-creations-heading" className="min-w-0 rounded-[24px] border border-border bg-card/88 p-5 shadow-sm sm:p-6">
      <RecentCreationsRefresh organizationId={organizationId} active={jobs.some(j => ["QUEUED", "SUBMITTED", "PROCESSING", "CREDIT_RESERVED"].includes(j.status))} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-primary">Made in your workspace</p>
          <h2 id="recent-creations-heading" className="font-display mt-2 text-xl font-semibold text-foreground">Recent creations</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your latest images, videos and sound, ready to revisit.</p>
        </div>
        <Link href={history} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          View all history <Icon name="arrow" className="size-4" />
        </Link>
      </div>
      {jobs.length ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {jobs.map(job => {
            const url = `${history}/${encodeURIComponent(job.id)}`;
            const artwork = preview(job.asset, job.mediaKind);
            const pending = ["QUEUED", "SUBMITTED", "PROCESSING", "CREDIT_RESERVED"].includes(job.status);
            const review = job.status === "MANUAL_REVIEW";
            const failed = job.status === "FAILED" || job.status === "CANCELLED";
            const label = review ? "Needs review" : pending ? "In progress" : failed ? job.status.toLowerCase() : "Ready";
            const statusTone = review ? "text-warning" : failed ? "text-destructive" : pending ? "text-info" : "text-success";
            const title = creationPrompt(job.requestPayload);
            return (
              <article key={job.id} className="group min-w-0 overflow-hidden rounded-[20px] border border-border bg-card transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40 motion-reduce:transform-none">
                <Link href={url} aria-label={`Open ${job.mediaKind.toLowerCase()} generation: ${title}`} className="block focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring">
                  <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-surface-sunken">
                    {artwork && job.asset ? (
                      <Image unoptimized src={artwork} alt={`Preview of ${title}`} fill sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transform-none" />
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-muted-foreground" aria-hidden="true">
                        <span className="grid size-14 place-items-center rounded-2xl border border-border bg-card shadow-xs"><Icon name={job.mediaKind === "IMAGE" ? "image" : job.mediaKind === "VIDEO" ? "video" : "voice"} className="size-7 text-primary" /></span>
                        <svg viewBox="0 0 108 24" width="108" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="opacity-40" aria-hidden="true"><path d="M1 12h9l4-5 5 10 6-14 6 18 6-10 4 1h11l5-8 6 16 6-10h10l5-5 5 10 4-3h15" /></svg>
                      </div>
                    )}
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/95 px-2.5 py-1.5 text-[11px] font-semibold text-foreground shadow-xs"><Icon name={job.mediaKind === "IMAGE" ? "image" : job.mediaKind === "VIDEO" ? "video" : "voice"} className="size-3.5" />{job.mediaKind === "VOICE" ? "Audio" : job.mediaKind === "IMAGE" ? "Image" : "Video"}</span>
                  </div>
                  <div className="space-y-2 p-3.5">
                    <h3 className="line-clamp-2 min-h-10 break-words text-sm font-semibold leading-5 text-foreground">{title}</h3>
                    <p className="truncate text-xs text-muted-foreground">{job.modelName}</p>
                    <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5 text-[11px]">
                      <span className={`inline-flex items-center gap-1.5 font-semibold ${statusTone}`}><span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{label}</span>
                      <time dateTime={job.createdAt.toISOString()} className="text-muted-foreground">{job.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</time>
                    </div>
                    {review ? <p className="text-xs leading-5 text-muted-foreground">Provider result needs review. Do not retry yet.</p> : null}
                  </div>
                </Link>
                {job.asset && job.status === "SUCCEEDED" ? (
                  <div className="flex items-center justify-between border-t border-border px-3.5 py-1.5 text-xs">
                    <span className="text-muted-foreground">{job.chargedCredits} credits</span>
                    <a href={`/api/assets/${encodeURIComponent(job.asset.id)}?download=1`} className="inline-flex min-h-9 items-center gap-1.5 font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"><Icon name="assets" className="size-3.5" /> Download</a>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface-sunken p-6 text-center">
          <Icon name="sparkles" className="size-9 text-primary" />
          <p className="font-display text-base font-semibold text-foreground">A blank canvas for your next idea</p>
          <p className="max-w-sm text-sm text-muted-foreground">Create an image, video or voiceover with Quick Create. Your media will appear here.</p>
        </div>
      )}
    </section>
  );
}
