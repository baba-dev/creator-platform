import { Icon } from "@/components/ui/icon";

/** Token-driven inline SVG artwork: no third-party assets, remote calls or image hydration. */
export function PricingArtwork() {
  return (
    <div className="relative isolate mx-auto w-full max-w-[550px] overflow-hidden rounded-[2rem] border border-border bg-card p-5 shadow-lg sm:p-7" aria-label="Illustration of image, video and audio creation">
      <div className="paper-grid absolute inset-0 opacity-50" aria-hidden="true" />
      <div className="creative-glow absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="relative flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">Creative cost atlas</span>
        <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-semibold text-primary">Live catalogue</span>
      </div>
      <svg className="relative mt-5 h-auto w-full" viewBox="0 0 520 330" fill="none" role="img" aria-labelledby="pricing-art-title">
        <title id="pricing-art-title">An illustrated media canvas with a landscape, a video play control and an audio waveform.</title>
        <defs>
          <linearGradient id="pricing-sky" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="var(--primary)" stopOpacity=".8" />
            <stop offset=".55" stopColor="var(--info)" stopOpacity=".65" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity=".85" />
          </linearGradient>
          <linearGradient id="pricing-ground" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="var(--primary)" stopOpacity=".55" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity=".52" />
          </linearGradient>
        </defs>
        <rect x="15" y="25" width="321" height="232" rx="23" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
        <rect x="27" y="37" width="297" height="173" rx="15" fill="url(#pricing-sky)" />
        <circle cx="245" cy="81" r="23" fill="var(--on-vivid)" opacity=".75" />
        <path d="M27 176 93 113 158 161 214 111 324 191V210H27Z" fill="var(--on-vivid)" opacity=".45" />
        <path d="M27 193 101 147 162 194 226 143 324 200V210H27Z" fill="url(#pricing-ground)" />
        <rect x="40" y="225" width="140" height="6" rx="3" fill="var(--foreground)" opacity=".7" />
        <rect x="40" y="238" width="95" height="4" rx="2" fill="var(--foreground)" opacity=".22" />
        <g className="motion-safe:animate-float">
          <rect x="281" y="116" width="222" height="133" rx="20" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
          <rect x="294" y="129" width="196" height="82" rx="12" fill="url(#pricing-sky)" />
          <path d="M367 150 367 190 400 170Z" fill="var(--on-vivid)" stroke="var(--on-vivid)" strokeLinejoin="round" strokeWidth="3" />
          <rect x="297" y="222" width="87" height="5" rx="2.5" fill="var(--foreground)" opacity=".6" />
          <rect x="392" y="222" width="68" height="5" rx="2.5" fill="var(--foreground)" opacity=".19" />
        </g>
        <rect x="63" y="266" width="414" height="49" rx="17" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
        <g stroke="var(--primary)" strokeWidth="4" strokeLinecap="round">
          <path d="M90 285v12M102 279v24M114 286v10M126 275v32M138 282v18M150 289v6M162 278v26M174 283v16M186 289v6M198 279v24M210 286v10M222 282v18" />
        </g>
        <rect x="268" y="284" width="91" height="6" rx="3" fill="var(--foreground)" opacity=".6" />
        <rect x="268" y="298" width="61" height="4" rx="2" fill="var(--foreground)" opacity=".2" />
        <circle cx="446" cy="290" r="11" fill="var(--primary)" opacity=".85" />
        <path d="m441 290 4 4 7-8" stroke="var(--primary-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="relative mt-4 grid grid-cols-3 gap-2">
        {([{ name: "image", label: "Visuals" }, { name: "video", label: "Motion" }, { name: "voice", label: "Sound" }] as const).map((item) => (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-background/80 px-2 py-3 text-xs font-semibold" key={item.label}>
            <Icon name={item.name} className="size-4 text-primary" />{item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
