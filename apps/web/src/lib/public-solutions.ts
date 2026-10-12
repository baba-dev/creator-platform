import type { IconName } from "@/components/ui/icon";
import { publicToolById } from "./public-tools";
import type {
  PricingCategory,
  PublicPricingItem,
} from "./public-pricing-contract";

export type SolutionSlug =
  | "marketing-agencies"
  | "ecommerce"
  | "social-media-creators"
  | "businesses"
  | "production-teams";

export type Solution = {
  slug: SolutionSlug;
  name: string;
  icon: IconName;
  eyebrow: string;
  headline: string;
  description: string;
  challenge: string;
  outcome: string;
  cover: string;
  idealFor: string;
  deliverables: readonly string[];
  benefits: readonly { title: string; description: string }[];
  workflow: readonly { title: string; description: string; toolId: string }[];
  modelCategories: readonly PricingCategory[];
  questions: readonly { question: string; answer: string }[];
  related: readonly SolutionSlug[];
};

export const solutions: readonly Solution[] = [
  {
    slug: "marketing-agencies",
    name: "Marketing agencies",
    icon: "director",
    eyebrow: "From first brief to client-ready assets",
    headline: "A complete campaign begins with a clearer creative direction.",
    description:
      "Shape client briefs into a connected production journey: concept, script, campaign visuals, motion, narration and reusable deliverables.",
    challenge:
      "Too many handoffs, revisions and disconnected tools can slow down creative delivery. Bring the planning and media work closer together.",
    outcome:
      "Move from a rough client request to a coordinated set of campaign concepts and production assets.",
    cover: "/solution-art/marketing-agencies.svg",
    idealFor:
      "Creative agencies, freelancers, account teams and brand campaign producers",
    deliverables: [
      "Creative brief",
      "Campaign key visuals",
      "Video concepts",
      "Voiceover drafts",
      "Organised campaign assets",
    ],
    benefits: [
      {
        title: "Present more than one direction",
        description:
          "Explore campaign concepts and visual options before committing to production.",
      },
      {
        title: "Carry an idea across media",
        description:
          "Move from scripts and still images into model-supported video and narration.",
      },
      {
        title: "Keep revisions connected",
        description:
          "Save generated work with project context rather than treating every output as a one-off.",
      },
    ],
    workflow: [
      {
        title: "Interpret the brief",
        description:
          "Define the audience, campaign objective and visual direction.",
        toolId: "creative-director",
      },
      {
        title: "Develop the creative",
        description:
          "Turn the direction into a campaign concept and key image.",
        toolId: "image-studio",
      },
      {
        title: "Build motion",
        description: "Explore supported video concepts and scene references.",
        toolId: "video-studio",
      },
      {
        title: "Give it a voice",
        description:
          "Create narration and carry the results into the asset library.",
        toolId: "voice-studio",
      },
    ],
    modelCategories: ["chat", "image", "video", "speech", "tools"],
    questions: [
      {
        question: "Can I work on multiple client campaigns?",
        answer:
          "Creators provides projects, assets and organization-scoped workspaces to keep creative work organized. Apply your own client access and rights process.",
      },
      {
        question: "Can I preview costs before generation?",
        answer:
          "The authenticated Studio displays a quote for supported settings before submitting billable work. The public pricing page lists currently published reference rates.",
      },
      {
        question: "Is the sample campaign a customer case study?",
        answer:
          "No. The campaign visuals and examples on this page are illustrative creative demonstrations, not customer testimonials or guaranteed results.",
      },
    ],
    related: ["production-teams", "businesses"],
  },
  {
    slug: "ecommerce",
    name: "E-commerce & retail",
    icon: "image",
    eyebrow: "Make more of every product",
    headline: "Turn your products into compelling creative campaigns.",
    description:
      "Develop product visual directions, lifestyle compositions, short promotional concepts and delivery-ready media from permitted source material.",
    challenge:
      "A product needs different creative assets for listings, launches and promotions. Starting a new production process for every format is inefficient.",
    outcome:
      "Create a coordinated visual story around a product, then adapt it for the next campaign.",
    cover: "/solution-art/ecommerce.svg",
    idealFor:
      "Online retailers, product marketers, catalog teams and emerging brands",
    deliverables: [
      "Product concepts",
      "Lifestyle scenes",
      "Campaign variations",
      "Product motion concepts",
      "Prepared media assets",
    ],
    benefits: [
      {
        title: "Explore more settings",
        description:
          "Try creative environments and treatments without rebuilding each brief from scratch.",
      },
      {
        title: "Adapt across formats",
        description:
          "Plan campaign assets for store pages, social posts and promotional stories.",
      },
      {
        title: "Refine existing assets",
        description:
          "Use supported editing and media operations to prepare source material for delivery.",
      },
    ],
    workflow: [
      {
        title: "Begin with your product",
        description: "Start from a source image you have permission to use.",
        toolId: "image-studio",
      },
      {
        title: "Create campaign variations",
        description: "Generate a coordinated set of product visual concepts.",
        toolId: "precision-image",
      },
      {
        title: "Explore motion",
        description:
          "Develop a model-supported product reveal or short visual sequence.",
        toolId: "video-studio",
      },
      {
        title: "Prepare the result",
        description: "Use eligible finishing operations for publication.",
        toolId: "mediakit",
      },
    ],
    modelCategories: ["image", "video", "tools"],
    questions: [
      {
        question: "Will AI always preserve my product exactly?",
        answer:
          "No. Generated content must be reviewed against real product details, packaging and applicable advertising requirements before publishing.",
      },
      {
        question: "Can I start with existing product photos?",
        answer:
          "Supported image and editing workflows accept permitted source material. Available controls depend on the selected enabled model.",
      },
      {
        question: "Where can I compare costs?",
        answer:
          "Browse the public pricing page for published rates, then check the authenticated quote for the selected settings before generation.",
      },
    ],
    related: ["businesses", "marketing-agencies"],
  },
  {
    slug: "social-media-creators",
    name: "Social media creators",
    icon: "video",
    eyebrow: "Make the next idea happen",
    headline: "One content idea. More ways to tell it.",
    description:
      "Draft hooks and scripts, create visuals, explore short-form motion, record AI narration and prepare assets for different social formats.",
    challenge:
      "A consistent content schedule means starting, adapting and finishing ideas repeatedly across formats.",
    outcome:
      "Build a repeatable creative flow from a short idea into a set of content-ready assets.",
    cover: "/solution-art/social-media-creators.svg",
    idealFor: "Short-form creators, video storytellers and personal brands",
    deliverables: [
      "Content ideas",
      "Script drafts",
      "Thumbnail concepts",
      "Vertical video concepts",
      "Voiceovers",
      "Captions and transcripts",
    ],
    benefits: [
      {
        title: "Start from a small prompt",
        description:
          "Develop a rough topic into creative direction and draft scripts.",
      },
      {
        title: "Try multiple visual directions",
        description:
          "Create image and motion concepts for the right audience and format.",
      },
      {
        title: "Reuse what you make",
        description:
          "Keep source media and generated outputs available for revisions and later content.",
      },
    ],
    workflow: [
      {
        title: "Find the angle",
        description: "Turn a topic into a compelling short-form script.",
        toolId: "scriptwriter",
      },
      {
        title: "Create the visual",
        description: "Explore original image and thumbnail concepts.",
        toolId: "image-studio",
      },
      {
        title: "Bring it into motion",
        description:
          "Generate short visual sequences with supported model settings.",
        toolId: "video-studio",
      },
      {
        title: "Finish the message",
        description:
          "Create narration and use eligible transcription for captions.",
        toolId: "transcription",
      },
    ],
    modelCategories: [
      "chat",
      "image",
      "video",
      "speech",
      "audio",
      "transcription",
    ],
    questions: [
      {
        question: "Does this publish directly to social platforms?",
        answer:
          "This showcase describes content creation and preparation, not automated publishing to third-party social networks.",
      },
      {
        question: "Can I make vertical video?",
        answer:
          "Enabled models expose their supported aspect ratios and duration controls in the Studio. Choose the configuration appropriate for your destination.",
      },
      {
        question: "Can I generate captions?",
        answer:
          "Creators provides transcription workflows and supported subtitle exports for eligible source recordings.",
      },
    ],
    related: ["marketing-agencies", "production-teams"],
  },
  {
    slug: "businesses",
    name: "Businesses & brands",
    icon: "brand",
    eyebrow: "Your business has a story to tell",
    headline: "Professional creative content without a complicated process.",
    description:
      "Plan announcements, campaign visuals, explainers and brand narratives in a workspace that connects creative direction with production.",
    challenge:
      "Marketing needs do not stop when a business has no dedicated video team, designer or writer available for every request.",
    outcome:
      "Make it easier to explore and produce professional-looking creative assets for ongoing business communication.",
    cover: "/solution-art/businesses.svg",
    idealFor:
      "Growing businesses, service companies, local brands and in-house marketers",
    deliverables: [
      "Brand concepts",
      "Announcement visuals",
      "Explainer scripts",
      "Spokesperson concepts",
      "Reusable marketing assets",
    ],
    benefits: [
      {
        title: "Begin with the message",
        description:
          "Shape product and service announcements into clearer creative briefs.",
      },
      {
        title: "Explore visual options",
        description:
          "Produce image, motion and narration concepts in one workspace.",
      },
      {
        title: "Understand spending",
        description:
          "Compare published customer prices and review quotes before supported jobs.",
      },
    ],
    workflow: [
      {
        title: "Set your brand direction",
        description: "Describe the message, audience and tone.",
        toolId: "brand-story",
      },
      {
        title: "Create promotional artwork",
        description: "Explore original imagery for the campaign.",
        toolId: "image-studio",
      },
      {
        title: "Explain your offer",
        description: "Draft an explainer script and suitable narration.",
        toolId: "scriptwriter",
      },
      {
        title: "Present it visually",
        description:
          "Explore consent-based presenter workflows where supported.",
        toolId: "spokesperson",
      },
    ],
    modelCategories: ["chat", "image", "video", "speech", "avatar"],
    questions: [
      {
        question: "Do I need to know AI model names?",
        answer:
          "No. Start with the outcome and use the public tools directory to find an appropriate creative workflow.",
      },
      {
        question: "Can a business collaborate with its team?",
        answer:
          "Creators supports organization-scoped workspaces with members and creative asset organization.",
      },
      {
        question: "Does a spokesperson require consent?",
        answer:
          "Yes. Only provide portrait and driving material you have permission and appropriate consent to use.",
      },
    ],
    related: ["ecommerce", "marketing-agencies"],
  },
  {
    slug: "production-teams",
    name: "Content production teams",
    icon: "projects",
    eyebrow: "Make the whole process connect",
    headline: "Connect your creative production from planning to delivery.",
    description:
      "Bring together scripts, storyboards, generation, voice, editing, reusable assets and supported storage so ideas do not disappear between stages.",
    challenge:
      "Disconnected applications and isolated output files make it harder to preserve context and iterate across an entire production.",
    outcome:
      "Build a more connected workflow for turning production plans into finished media assets.",
    cover: "/solution-art/production-teams.svg",
    idealFor:
      "Studios, creative operations, campaign producers and in-house content teams",
    deliverables: [
      "Creative plans",
      "Storyboards",
      "Source media",
      "Generated clips",
      "Narration",
      "Edited sequences",
      "Project assets",
    ],
    benefits: [
      {
        title: "Plan with continuity",
        description:
          "Connect creative briefs, scripts and story development to subsequent production work.",
      },
      {
        title: "Choose tools for each task",
        description:
          "Use the enabled model and workflow appropriate to the media requirement.",
      },
      {
        title: "Keep outputs discoverable",
        description:
          "Organize assets with their generation provenance, projects and supported storage.",
      },
    ],
    workflow: [
      {
        title: "Plan production",
        description: "Shape a structured brief and shot direction.",
        toolId: "creative-director",
      },
      {
        title: "Generate the media",
        description:
          "Create supported visuals and motion from your production inputs.",
        toolId: "video-studio",
      },
      {
        title: "Edit the sequence",
        description: "Arrange, refine and preview your clips.",
        toolId: "video-editor",
      },
      {
        title: "Prepare deliverables",
        description:
          "Use supported finishing operations and keep outputs organized.",
        toolId: "mediakit",
      },
    ],
    modelCategories: [
      "chat",
      "image",
      "video",
      "speech",
      "audio",
      "transcription",
      "avatar",
      "tools",
    ],
    questions: [
      {
        question:
          "Is this a replacement for every professional editing system?",
        answer:
          "No. Creators connects its own supported planning, media generation, editing and finishing workflows. Choose specialist software where a production requires additional controls.",
      },
      {
        question: "Does the platform track generated assets?",
        answer:
          "Generated media can be saved as workspace assets with provenance and organized through projects, folders and history.",
      },
      {
        question: "Can we connect external storage?",
        answer:
          "Supported platform and bring-your-own storage connections are managed inside the authenticated workspace, subject to configuration and access.",
      },
    ],
    related: ["marketing-agencies", "social-media-creators"],
  },
];

export function solutionBySlug(slug: string): Solution | undefined {
  return solutions.find((item) => item.slug === slug);
}

export function solutionHref(solution: Pick<Solution, "slug">): string {
  return "/solutions/" + solution.slug;
}

export type FinderAudience = SolutionSlug;
export type FinderGoal =
  "campaign" | "product" | "social" | "explainer" | "finish";
export type FinderPriority = "speed" | "quality" | "manage" | "cost";
const goalTool: Record<FinderGoal, string> = {
  campaign: "creative-director",
  product: "image-studio",
  social: "video-studio",
  explainer: "scriptwriter",
  finish: "mediakit",
};
export function recommendSolution(
  audience: FinderAudience,
  goal: FinderGoal,
  priority: FinderPriority,
) {
  const solution = solutionBySlug(audience);
  if (!solution) return null;
  const preferredId = goalTool[goal];
  const preferred = publicToolById(preferredId);
  const workflow = solution.workflow
    .map((step) => publicToolById(step.toolId))
    .filter((tool) => tool !== undefined);
  const tools = [preferred, ...workflow]
    .filter((tool) => tool !== undefined)
    .filter(
      (tool, index, all) =>
        all.findIndex((candidate) => candidate.id === tool.id) === index,
    )
    .slice(0, 3);
  return {
    solution,
    tools,
    advice: (
      {
        speed:
          "Start with a focused tool or template, then expand your concept as needed.",
        quality:
          "Explore the direction first, use permitted references and review each generated result.",
        manage:
          "Keep working assets and production context together in your project.",
        cost: "Check published customer prices and review the authenticated quote before billable work.",
      } as const
    )[priority],
  };
}

export function relevantModels(
  items: readonly PublicPricingItem[],
  categories: readonly PricingCategory[],
): PublicPricingItem[] {
  return items.filter((item) => categories.includes(item.category));
}
