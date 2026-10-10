import { Eyebrow } from "@/components/ui/creative";

export function LearnVisualStory({ story }: { story: string }) {
  if (story === "image-campaign-production") {
    const steps = [
      ["01", "Select", "Protect the master"],
      ["02", "Refine", "Fix only the defects"],
      ["03", "Upscale", "Inspect real detail"],
      ["04", "Adapt", "Recompose each format"],
      ["05", "Deliver", "Verify every export"],
    ] as const;
    return (
      <section
        aria-labelledby="image-campaign-production-title"
        className="learn-visual-story mx-auto my-12 max-w-5xl overflow-hidden rounded-[28px] border border-border bg-card p-6 shadow-sm sm:p-9"
      >
        <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
          <div>
            <Eyebrow>One master, many destinations</Eyebrow>
            <h2
              id="image-campaign-production-title"
              className="font-display mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              Make the image useful everywhere.
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              The master stays protected while deliberate changes create a family
              of formats. Each arrow represents a reviewable production decision,
              not automatic image perfection.
            </p>
            <p className="font-hand mt-5 text-2xl text-primary">
              Finish for the destination.
            </p>
          </div>
          <div className="rounded-3xl bg-muted/60 p-4 sm:p-6">
            <svg
              viewBox="0 0 760 255"
              role="img"
              aria-label="A five-stage campaign production journey: select master, refine, upscale, adapt composition, and deliver reviewed images"
              className="h-auto w-full overflow-visible text-primary"
            >
              <defs>
                <marker id="campaign-flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0 0L10 5L0 10z" fill="currentColor" />
                </marker>
              </defs>
              <path
                className="learn-workflow-path"
                d="M65 116 H702"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                markerEnd="url(#campaign-flow-arrow)"
              />
              {[83, 220, 357, 494, 631].map((cx, i) => (
                <g key={cx} className="learn-workflow-node" style={{ animationDelay: `${i * 130}ms` }}>
                  <circle cx={cx} cy="116" r="38" fill="var(--card)" stroke="currentColor" strokeWidth="2.5" />
                  {i === 0 && <path d={`M${cx - 12} 101h24v30h-24z M${cx - 6} 94h12 M${cx - 5} 116l4 4 8-10`} stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />}
                  {i === 1 && <path d={`M${cx - 14} 106h28v21h-28z M${cx - 8} 115l6 6 12-12`} stroke="currentColor" strokeWidth="3" fill="none" />}
                  {i === 2 && <path d={`M${cx} 133V100m-11 11 11-11 11 11 M${cx - 13} 134h26`} stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
                  {i === 3 && <path d={`M${cx - 14} 105h19v26h-19z M${cx + 7} 100h14v31h-14z`} stroke="currentColor" strokeWidth="3" fill="none" />}
                  {i === 4 && <path d={`M${cx - 14} 104h28v27h-28z M${cx - 8} 117l5 5 11-13`} stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />}
                </g>
              ))}
              <text x="75" y="188" fill="currentColor" fontSize="16">MASTER</text>
              <text x="203" y="188" fill="currentColor" fontSize="16">EDIT</text>
              <text x="326" y="188" fill="currentColor" fontSize="16">DETAIL</text>
              <text x="464" y="188" fill="currentColor" fontSize="16">FORMAT</text>
              <text x="605" y="188" fill="currentColor" fontSize="16">EXPORT</text>
            </svg>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {steps.map(([number, label, note]) => (
                <div key={number} className="rounded-2xl bg-card p-3">
                  <p className="font-mono text-[10px] font-bold tracking-widest text-primary">{number}</p>
                  <p className="mt-1 text-sm font-semibold">{label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (story === "image-art-direction") {
    const controls = [
      ["01", "Composition", "Guide the eye"],
      ["02", "Lighting", "Set the mood"],
      ["03", "Style", "Unify the palette"],
      ["04", "Continuity", "Keep the identity"],
    ] as const;
    return (
      <section
        aria-labelledby="image-art-direction-title"
        className="learn-visual-story mx-auto my-12 max-w-5xl overflow-hidden rounded-[28px] border border-border bg-card p-6 shadow-sm sm:p-9"
      >
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <Eyebrow>Inside the visual language</Eyebrow>
            <h2
              id="image-art-direction-title"
              className="font-display mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              Same subject. Different story.
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Give each visual decision one job. When subject identity stays
              consistent, changing the frame, light, or atmosphere becomes a
              meaningful creative choice rather than a random new image.
            </p>
            <p className="font-hand mt-5 text-2xl text-primary">
              Art direction is intentional variation.
            </p>
          </div>
          <div className="rounded-3xl bg-muted/60 p-4 sm:p-6">
            <svg
              viewBox="0 0 640 240"
              role="img"
              aria-label="Four connected creative controls: framing, lighting, style, and consistency, represented by a moving path connecting four visual symbols"
              className="h-auto w-full overflow-visible text-primary"
            >
              <defs>
                <marker
                  id="art-direction-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M0 0L10 5L0 10Z" fill="currentColor" />
                </marker>
              </defs>
              <path
                className="learn-art-direction-path"
                d="M82 120H558"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
                markerEnd="url(#art-direction-arrow)"
              />
              {[86, 235, 384, 533].map((cx, i) => (
                <g
                  key={cx}
                  className="learn-art-direction-orbit"
                  style={{ animationDelay: `${i * 180}ms` }}
                >
                  <circle
                    cx={cx}
                    cy="120"
                    r="42"
                    fill="var(--card)"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  {i === 0 && (
                    <g
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    >
                      <path d="M69 104h11m12 0h11M69 136h11m12 0h11M69 104v11m0 10v11M103 104v11m0 10v11" />
                      <circle
                        cx="86"
                        cy="120"
                        r="5"
                        fill="currentColor"
                        stroke="none"
                      />
                    </g>
                  )}
                  {i === 1 && (
                    <g
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    >
                      <circle cx="235" cy="120" r="10" />
                      <path d="M235 98v-8m0 52v8m-22-30h-8m60 0h-8m-37-15-6-6m42 42-6-6m0-30 6-6m-42 42 6-6" />
                    </g>
                  )}
                  {i === 2 && (
                    <g fill="none" stroke="currentColor" strokeWidth="3">
                      <circle cx="375" cy="115" r="9" />
                      <circle cx="395" cy="115" r="9" />
                      <circle cx="385" cy="132" r="9" />
                    </g>
                  )}
                  {i === 3 && (
                    <g
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    >
                      <path d="M521 109h23v22h-23zM527 102h23v22M521 119l7 6 14-15" />
                    </g>
                  )}
                </g>
              ))}
            </svg>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {controls.map(([number, label, note]) => (
                <div key={label} className="rounded-2xl bg-card p-3">
                  <p className="font-mono text-[10px] font-bold tracking-widest text-primary">
                    {number}
                  </p>
                  <p className="mt-1 text-sm font-semibold">{label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {note}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (story !== "image-prompt-workflow") return null;

  const steps = [
    ["01", "Brief", "Decide the job"],
    ["02", "Prompt", "Direct the frame"],
    ["03", "Generate", "Compare options"],
    ["04", "Refine", "Finish with intent"],
  ] as const;

  return (
    <section
      aria-labelledby="image-workflow-title"
      className="learn-visual-story mx-auto my-12 max-w-5xl overflow-hidden rounded-[28px] border border-border bg-card p-6 shadow-sm sm:p-9"
    >
      <div className="grid gap-7 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
        <div>
          <Eyebrow>Four deliberate decisions</Eyebrow>
          <h2
            id="image-workflow-title"
            className="font-display mt-4 text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            A repeatable path from idea to image.
          </h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            Strong results rarely arrive by accident. Give each pass one clear
            purpose, keep what works, and change one variable at a time.
          </p>
          <p className="font-hand mt-5 text-2xl text-primary">
            Direction beats decoration.
          </p>
        </div>

        <div className="relative rounded-3xl bg-muted/60 p-4 sm:p-6">
          <svg
            viewBox="0 0 760 270"
            role="img"
            aria-label="An animated four-step workflow moving from a creative brief to prompting, generation, and refinement"
            className="h-auto w-full overflow-visible text-primary"
          >
            <defs>
              <marker
                id="workflow-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
            </defs>
            <path
              className="learn-workflow-path"
              d="M88 137 C170 35 245 35 326 137 S485 239 572 137 S665 50 706 94"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              markerEnd="url(#workflow-arrow)"
            />
            <path
              d="M50 204 C190 248 392 228 712 210"
              fill="none"
              stroke="var(--border)"
              strokeWidth="2"
              strokeDasharray="5 12"
              strokeLinecap="round"
            />
            {[
              [82, 137, "M70 126h24v22H70z M76 120h12"],
              [286, 92, "M274 82h24v20h-24z M279 108h14 M278 88h16 M278 94h12"],
              [478, 188, "M466 176h24v24h-24z M470 192l6-7 5 4 5-6"],
              [650, 104, "M650 89v30 M635 104h30 M640 94l20 20 M660 94l-20 20"],
            ].map(([cx, cy, drawing], index) => (
              <g
                key={index}
                className="learn-workflow-node"
                style={{ animationDelay: `${index * 140}ms` }}
              >
                <circle
                  cx={cx as number}
                  cy={cy as number}
                  r="34"
                  fill="var(--card)"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  d={drawing as string}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            ))}
          </svg>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {steps.map(([number, label, note]) => (
              <div key={label} className="rounded-2xl bg-card p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">
                  {number}
                </p>
                <p className="mt-1 text-sm font-semibold">{label}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {note}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
