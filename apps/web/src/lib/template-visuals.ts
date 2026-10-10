export type TemplateMediaKind = "IMAGE" | "VIDEO" | "VOICE";
export const templateVisuals = {
  "youtube-thumbnail": {
    icon: "creator",
    cover: "/template-covers/youtube-thumbnail.svg",
    alt: "Illustrated example of YouTube Thumbnail",
  },
  "instagram-post": {
    icon: "editorial",
    cover: "/template-covers/instagram-post.svg",
    alt: "Illustrated example of Instagram Post",
  },
  "instagram-story": {
    icon: "story",
    cover: "/template-covers/instagram-story.svg",
    alt: "Illustrated example of Instagram Story",
  },
  "facebook-ad": {
    icon: "ad",
    cover: "/template-covers/facebook-ad.svg",
    alt: "Illustrated example of Facebook Ad",
  },
  "linkedin-post": {
    icon: "business",
    cover: "/template-covers/linkedin-post.svg",
    alt: "Illustrated example of LinkedIn Post",
  },
  "product-photography": {
    icon: "product",
    cover: "/template-covers/product-photography.svg",
    alt: "Illustrated example of Product Photography",
  },
  "product-white-background": {
    icon: "white",
    cover: "/template-covers/product-white-background.svg",
    alt: "Illustrated example of Product on White",
  },
  "luxury-product-ad": {
    icon: "luxury",
    cover: "/template-covers/luxury-product-ad.svg",
    alt: "Illustrated example of Luxury Product Ad",
  },
  "food-photography": {
    icon: "food",
    cover: "/template-covers/food-photography.svg",
    alt: "Illustrated example of Food Photography",
  },
  "realistic-portrait": {
    icon: "portrait",
    cover: "/template-covers/realistic-portrait.svg",
    alt: "Illustrated example of Realistic Portrait",
  },
  "cinematic-portrait": {
    icon: "film",
    cover: "/template-covers/cinematic-portrait.svg",
    alt: "Illustrated example of Cinematic Portrait",
  },
  "logo-concept": {
    icon: "logo",
    cover: "/template-covers/logo-concept.svg",
    alt: "Illustrated example of Logo Concept",
  },
  "event-poster": {
    icon: "poster",
    cover: "/template-covers/event-poster.svg",
    alt: "Illustrated example of Event Poster",
  },
  "character-concept": {
    icon: "character",
    cover: "/template-covers/character-concept.svg",
    alt: "Illustrated example of Character Concept",
  },
  "cinematic-landscape": {
    icon: "landscape",
    cover: "/template-covers/cinematic-landscape.svg",
    alt: "Illustrated example of Cinematic Landscape",
  },
  "product-promo-video": {
    icon: "promo",
    cover: "/template-covers/product-promo-video.svg",
    alt: "Illustrated example of Product Promo Video",
  },
  "instagram-reel": {
    icon: "reel",
    cover: "/template-covers/instagram-reel.svg",
    alt: "Illustrated example of Instagram Reel",
  },
  "youtube-short": {
    icon: "short",
    cover: "/template-covers/youtube-short.svg",
    alt: "Illustrated example of YouTube Short",
  },
  "cinematic-product-reveal": {
    icon: "reveal",
    cover: "/template-covers/cinematic-product-reveal.svg",
    alt: "Illustrated example of Cinematic Product Reveal",
  },
  "social-video-ad": {
    icon: "social",
    cover: "/template-covers/social-video-ad.svg",
    alt: "Illustrated example of Social Video Ad",
  },
  "corporate-narration": {
    icon: "corporate",
    cover: "/template-covers/corporate-narration.svg",
    alt: "Illustrated example of Corporate Narration",
  },
  "social-voiceover": {
    icon: "voiceover",
    cover: "/template-covers/social-voiceover.svg",
    alt: "Illustrated example of Social Voice-over",
  },
  "product-ad-voice": {
    icon: "advoice",
    cover: "/template-covers/product-ad-voice.svg",
    alt: "Illustrated example of Product Ad Voice",
  },
  "podcast-intro": {
    icon: "podcast",
    cover: "/template-covers/podcast-intro.svg",
    alt: "Illustrated example of Podcast Intro",
  },
  "documentary-narration": {
    icon: "documentary",
    cover: "/template-covers/documentary-narration.svg",
    alt: "Illustrated example of Documentary Narration",
  },
} as const;
export function getTemplateVisual(slug: string, kind: TemplateMediaKind) {
  const entry: { icon: string; cover: string; alt: string } | undefined = (
    templateVisuals as Record<
      string,
      { icon: string; cover: string; alt: string }
    >
  )[slug];
  return (
    entry ?? {
      icon:
        kind === "VIDEO" ? "promo" : kind === "VOICE" ? "podcast" : "editorial",
      cover:
        kind === "VIDEO"
          ? templateVisuals["product-promo-video"].cover
          : kind === "VOICE"
            ? templateVisuals["podcast-intro"].cover
            : templateVisuals["instagram-post"].cover,
      alt: "Illustrated creative template example",
    }
  );
}

export function templateActivationHref(organizationSlug: string, slug: string) {
  return `/app/${encodeURIComponent(organizationSlug)}?template=${encodeURIComponent(slug)}#create`;
}
