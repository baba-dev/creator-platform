import type { IconName } from "@/components/ui/icon";
import type {
  PricingCategory,
  PublicPricingItem,
} from "./public-pricing-contract";

export type ToolLanding = {
  slug: string;
  seoTitle: string;
  seoDescription: string;
  eyebrow: string;
  hero: string;
  introduction: string;
  proof: readonly string[];
  screenshot: {
    src: string;
    alt: string;
    prompt: string;
  };
  outcomes: readonly {
    title: string;
    description: string;
    icon: IconName;
  }[];
  features: readonly {
    title: string;
    description: string;
  }[];
  steps: readonly {
    title: string;
    description: string;
  }[];
  inputs: readonly string[];
  outputs: readonly string[];
  useCases: readonly {
    title: string;
    description: string;
  }[];
  modelCategories: readonly PricingCategory[];
  modelAvailableIn?: readonly string[];
  modelIntroduction: string;
  notes: readonly string[];
  relatedContent: readonly {
    href: string;
    label: string;
    description: string;
  }[];
  questions: readonly {
    question: string;
    answer: string;
  }[];
};

const screenshot = (slug: string) => `/tool-screenshots/${slug}.jpg`;

export const toolLandings: readonly ToolLanding[] = [
  {
    slug: "ai-image-generator",
    seoTitle: "AI Image Generator for Campaigns, Products & Concepts",
    seoDescription:
      "Create original product visuals, campaign concepts and illustrations with Aiwa Creators. Compare published AI image models and refine every brief.",
    eyebrow: "Text-to-image and reference-led creation",
    hero: "Turn the picture in your head into a visual you can actually use.",
    introduction:
      "Image Studio gives a loose idea somewhere useful to go. Write the scene in everyday language, choose an enabled image model, set the shape of the output and keep the resulting asset connected to the rest of your campaign. It works for polished product concepts and strange first sketches alike—without making the prompt box feel like a programming exercise.",
    proof: ["Text-to-image", "Model-aware controls", "Saved to your workspace"],
    screenshot: {
      src: screenshot("ai-image-generator"),
      alt: "Image Studio with Seedream selected, an example frankincense perfume campaign prompt and creation controls",
      prompt:
        "A premium frankincense perfume bottle on warm Omani stone, soft sunrise, editorial product photography.",
    },
    outcomes: [
      {
        title: "Find the look before the shoot",
        description:
          "Explore lighting, composition and art direction while the campaign is still easy to change.",
        icon: "image",
      },
      {
        title: "Make one brief stretch further",
        description:
          "Develop square, portrait and landscape directions from the same creative thought.",
        icon: "sparkles",
      },
      {
        title: "Keep production connected",
        description:
          "Save visuals as workspace assets, then carry them into editing, video or finishing tools.",
        icon: "projects",
      },
    ],
    features: [
      {
        title: "Plain-language prompts",
        description:
          "Describe the subject, setting, mood, light and intended format. Pixel can help strengthen a rough prompt when you need it.",
      },
      {
        title: "A real choice of models",
        description:
          "Use the model catalogue published for your workspace instead of being locked into one invisible engine.",
      },
      {
        title: "References when supported",
        description:
          "Bring permitted source imagery into model-supported workflows for more directed composition and style exploration.",
      },
      {
        title: "Useful output controls",
        description:
          "Choose supported aspect ratios, resolution and output count from controls that change with the selected model.",
      },
      {
        title: "A quote before creation",
        description:
          "The authenticated Studio calculates the current credit quote for the chosen settings before anything billable is submitted.",
      },
      {
        title: "A path beyond generation",
        description:
          "Continue into Precision Image Studio, Video Studio or MediaKit instead of downloading and starting over somewhere else.",
      },
    ],
    steps: [
      {
        title: "Write the visual brief",
        description:
          "Name the subject and add the details that matter: audience, setting, lighting, camera language and mood.",
      },
      {
        title: "Choose the model and frame",
        description:
          "Compare available image models, then pick supported size, aspect ratio and reference options.",
      },
      {
        title: "Review the exact quote",
        description:
          "Check the in-Studio credit estimate. Nothing is generated until you explicitly submit the job.",
      },
      {
        title: "Create, assess and refine",
        description:
          "Review product accuracy, brand fit and rights, then iterate or move the image into a connected workflow.",
      },
    ],
    inputs: [
      "A written image brief",
      "Optional permitted references",
      "Aspect ratio and output settings",
    ],
    outputs: [
      "Original image concepts",
      "Campaign-ready source assets",
      "Visuals ready for editing or animation",
    ],
    useCases: [
      {
        title: "Product campaign concepts",
        description:
          "Explore environments and lighting directions around a real product before committing to a full production route.",
      },
      {
        title: "Social and editorial artwork",
        description:
          "Build a distinctive visual around a launch, article, event or content series in the format you need.",
      },
      {
        title: "Moodboards and story frames",
        description:
          "Make the visual language of an idea easier to discuss with collaborators, clients and production teams.",
      },
    ],
    modelCategories: ["image"],
    modelAvailableIn: ["Image"],
    modelIntroduction:
      "The image models below are pulled from the live public catalogue when they are enabled, configured and have published customer pricing.",
    notes: [
      "Generated content can contain visual errors; review people, products, packaging and text before publishing.",
      "Only upload reference material you are allowed to use.",
      "Exact cost depends on the current model and settings shown in the authenticated quote.",
    ],
    relatedContent: [
      {
        href: "/solutions/ecommerce",
        label: "E-commerce & retail",
        description:
          "See how product visuals connect to a wider campaign workflow.",
      },
      {
        href: "/learn/topics/images",
        label: "Image guides",
        description:
          "Read practical guidance for image prompts, references and review.",
      },
      {
        href: "/tools/ai-image-editor",
        label: "AI Image Editor",
        description:
          "Refine an existing visual without losing the original direction.",
      },
    ],
    questions: [
      {
        question: "Can I generate an image from text alone?",
        answer:
          "Yes. Start with a written description. Some enabled models also accept permitted reference images when you want a more directed result.",
      },
      {
        question: "Which AI image model should I use?",
        answer:
          "It depends on the job. Compare the published model capabilities below, then use the controls shown for that model in Image Studio. Pixel can also help you choose.",
      },
      {
        question: "Does opening Image Studio cost credits?",
        answer:
          "No. You can write a prompt, choose settings and review the quote first. Credits are used only after you submit a billable generation.",
      },
      {
        question: "Can I use the result commercially?",
        answer:
          "Usage depends on your plan, the selected provider terms, your source-material rights and applicable law. Review those requirements before publishing.",
      },
    ],
  },
  {
    slug: "ai-video-generator",
    seoTitle: "AI Video Generator for Text and Image-to-Video",
    seoDescription:
      "Create cinematic clips from text or permitted images. Compare published video models, supported formats and current customer pricing in Aiwa Creators.",
    eyebrow: "Text-to-video and image-to-video",
    hero: "Turn a scene description—or a strong still—into a moving idea.",
    introduction:
      "Video Studio is built for the point where a storyboard needs motion. Start with a prompt, an image or supported first and last frames; choose an enabled video model; then set only the duration, format and controls that model understands. The result stays close to the rest of your creative work, ready for assembly in the Video Editing Desk.",
    proof: [
      "Text and image inputs",
      "Model-specific motion controls",
      "Quote before generation",
    ],
    screenshot: {
      src: screenshot("ai-video-generator"),
      alt: "Video Studio with Seedance selected and an example vertical perfume campaign shot entered",
      prompt:
        "A slow cinematic orbit around a luxury frankincense perfume bottle at sunrise, warm desert light, 9:16 social campaign.",
    },
    outcomes: [
      {
        title: "Prototype the shot",
        description:
          "Test camera language, movement and atmosphere before a production route is locked.",
        icon: "video",
      },
      {
        title: "Put still ideas in motion",
        description:
          "Use supported image-led workflows to animate an approved campaign visual or story frame.",
        icon: "image",
      },
      {
        title: "Build a sequence, not a pile",
        description:
          "Save clips to the workspace and assemble them in a connected editing workflow.",
        icon: "director",
      },
    ],
    features: [
      {
        title: "Text-to-video",
        description:
          "Describe the subject, action, camera, setting and pace in normal creative language.",
      },
      {
        title: "Image-to-video",
        description:
          "Start from permitted imagery when the chosen model supports a reference, first frame or end frame.",
      },
      {
        title: "Model-aware duration",
        description:
          "Available lengths, resolutions and ratios adapt to the selected model rather than promising controls it cannot honour.",
      },
      {
        title: "Camera and motion direction",
        description:
          "Use prompt language and supported controls to communicate the movement that gives the clip its intent.",
      },
      {
        title: "Workspace asset flow",
        description:
          "Generated clips stay available for projects, review, editing and downstream media preparation.",
      },
      {
        title: "Transparent preflight",
        description:
          "Review the current Studio quote for the exact model and settings before submitting a generation.",
      },
    ],
    steps: [
      {
        title: "Choose how the shot begins",
        description:
          "Start with text, a permitted still or supported frame references, depending on the selected workflow.",
      },
      {
        title: "Direct the movement",
        description:
          "Describe what changes in the scene, how the camera behaves and how quickly the moment unfolds.",
      },
      {
        title: "Set the supported format",
        description:
          "Pick the available aspect ratio, duration, resolution and other model-specific controls.",
      },
      {
        title: "Quote, generate and edit",
        description:
          "Approve the exact quote, review the clip carefully and carry selected takes into the editing desk.",
      },
    ],
    inputs: [
      "A scene description",
      "Optional permitted source image or frames",
      "Duration, ratio and model controls",
    ],
    outputs: [
      "Short generated clips",
      "Image-led motion concepts",
      "Video assets ready for timeline editing",
    ],
    useCases: [
      {
        title: "Short-form product reveals",
        description:
          "Develop a hero movement, atmospheric orbit or detail shot for a social campaign concept.",
      },
      {
        title: "Animated story frames",
        description:
          "Move from a storyboard or approved key visual into an early motion direction.",
      },
      {
        title: "Creative pitch films",
        description:
          "Give clients and collaborators a clearer feel for pacing and visual tone before full production.",
      },
    ],
    modelCategories: ["video"],
    modelAvailableIn: ["Video"],
    modelIntroduction:
      "These are the enabled video models that currently have a public customer-pricing entry. Supported inputs and controls can differ significantly by model.",
    notes: [
      "Generated motion can drift from the prompt or source image; review every frame before use.",
      "People, brands and copyrighted source material require appropriate permission.",
      "Duration, resolution and references can change the final credit quote.",
    ],
    relatedContent: [
      {
        href: "/solutions/social-media-creators",
        label: "Social media creators",
        description:
          "See a connected flow from hook and script to vertical video.",
      },
      {
        href: "/tools/video-editor",
        label: "Video Editing Desk",
        description:
          "Trim and assemble selected clips into a coherent sequence.",
      },
      {
        href: "/learn",
        label: "Learn",
        description:
          "Browse current production guidance and creative workflow articles.",
      },
    ],
    questions: [
      {
        question: "Can I create video from both text and images?",
        answer:
          "Yes, depending on the selected model. Video Studio shows only the input types and controls supported by that model.",
      },
      {
        question: "How long can a generated clip be?",
        answer:
          "Available durations vary by model and configuration. Choose the model first and Video Studio will expose its currently supported options.",
      },
      {
        question: "Can I edit the result?",
        answer:
          "Yes. Save selected clips to the workspace, then open the Video Editing Desk to trim, order and prepare a sequence.",
      },
      {
        question: "Will entering a prompt charge credits?",
        answer:
          "No. Writing a prompt and reviewing settings are not billable. The authenticated Studio shows a quote before you submit generation.",
      },
    ],
  },
  {
    slug: "ai-voice-generator",
    seoTitle: "AI Voice Generator for Narration and Text-to-Speech",
    seoDescription:
      "Turn scripts into AI narration with selectable voices and supported speech controls. Compare current text-to-speech models and pricing.",
    eyebrow: "AI narration and text-to-speech",
    hero: "Give the words a voice that fits the story.",
    introduction:
      "Voice Studio turns written copy into usable narration without hiding the important choices. Paste a script, choose from available voices, select an enabled speech model and review its supported controls. It is a focused production space for ads, explainers and social video—not a novelty voice button.",
    proof: [
      "Selectable voices",
      "Multilingual model options",
      "Reusable workspace audio",
    ],
    screenshot: {
      src: screenshot("ai-voice-generator"),
      alt: "Voice Studio speech generation page with a Seed Audio model and an example fragrance narration entered",
      prompt:
        "Some ideas deserve more than a voice. They deserve the right pause, pace, and presence.",
    },
    outcomes: [
      {
        title: "Hear the script sooner",
        description:
          "Move from silent copy to a reviewable narration direction while the wording can still change.",
        icon: "voice",
      },
      {
        title: "Match voice to message",
        description:
          "Choose an appropriate verified voice rather than accepting a single default speaker.",
        icon: "user",
      },
      {
        title: "Keep audio in the campaign",
        description:
          "Save generated narration with the assets and projects it belongs to.",
        icon: "assets",
      },
    ],
    features: [
      {
        title: "Script-led generation",
        description:
          "Write or paste the exact words you want spoken, then revise the copy before generating again.",
      },
      {
        title: "Voice selection",
        description:
          "Choose from currently available voice options and use the Casting Booth when you want to audition first.",
      },
      {
        title: "Model-specific speech controls",
        description:
          "Language, pacing and other options appear only when the active model supports them.",
      },
      {
        title: "Production-ready continuity",
        description:
          "Carry approved narration into spokesperson, video and project workflows without losing its context.",
      },
      {
        title: "Published model comparison",
        description:
          "See the customer-facing models, providers, capabilities and billing basis listed below.",
      },
      {
        title: "Quote before synthesis",
        description:
          "Review the current cost for the script and configuration before a billable speech job is submitted.",
      },
    ],
    steps: [
      {
        title: "Prepare the words",
        description:
          "Write for the ear: short sentences, deliberate punctuation and a clear intended pace.",
      },
      {
        title: "Choose a voice and model",
        description:
          "Pick a suitable speaker, language and enabled speech model for the role.",
      },
      {
        title: "Review supported controls",
        description:
          "Set the available speech options and check the exact authenticated quote.",
      },
      {
        title: "Generate and listen critically",
        description:
          "Check pronunciation, tone and timing, then revise the script or continue into production.",
      },
    ],
    inputs: [
      "A narration script",
      "A selected voice",
      "Language and supported speech settings",
    ],
    outputs: [
      "AI-generated narration",
      "Voiceover assets for video",
      "Audio saved to the workspace",
    ],
    useCases: [
      {
        title: "Advertisement voiceover",
        description:
          "Hear a product script in context and develop a delivery direction for short commercial work.",
      },
      {
        title: "Explainers and tutorials",
        description:
          "Create clear spoken guidance for a product walkthrough, internal piece or educational video.",
      },
      {
        title: "Social narration",
        description:
          "Give a vertical edit or visual story a consistent voice without separating audio from the project.",
      },
    ],
    modelCategories: ["speech"],
    modelAvailableIn: ["Speech"],
    modelIntroduction:
      "The list reflects enabled speech models with published customer pricing. Voice availability and supported language controls can vary.",
    notes: [
      "Listen to the full result; names, abbreviations and specialist terms may need script adjustments.",
      "Use only voices and reference material you have permission to use.",
      "The final quote depends on the current model, text length and billing basis.",
    ],
    relatedContent: [
      {
        href: "/tools/voice-casting",
        label: "Voice Casting Booth",
        description: "Audition and compare verified voices before synthesis.",
      },
      {
        href: "/tools/ai-spokesperson",
        label: "AI Spokesperson",
        description:
          "Pair approved narration with a permitted presenter portrait.",
      },
      {
        href: "/solutions/businesses",
        label: "Business workflows",
        description:
          "See how narration fits explainers, announcements and campaigns.",
      },
    ],
    questions: [
      {
        question: "Is this the same as voice cloning?",
        answer:
          "No. Voice Studio is centred on available approved voices and supported synthesis workflows. Never imitate a real person without the rights and consent required.",
      },
      {
        question: "Can I audition voices before generating a full script?",
        answer:
          "Use the Voice Casting Booth to compare available speakers, then continue with the voice that suits the role.",
      },
      {
        question: "Which languages are supported?",
        answer:
          "Language availability depends on the selected model and voice. The authenticated Studio shows the controls that are currently supported.",
      },
      {
        question: "When are credits used?",
        answer:
          "Only after you submit a billable synthesis. You can prepare the script, choose a model and inspect the quote first.",
      },
    ],
  },
  {
    slug: "ai-spokesperson",
    seoTitle: "AI Spokesperson and Talking Avatar Video Generator",
    seoDescription:
      "Create presenter-led videos from permitted portraits, scripts and speech. Explore published avatar models and an honest, consent-first workflow.",
    eyebrow: "Talking-avatar and presenter videos",
    hero: "Put a clear, human face to the message.",
    introduction:
      "AI Spokesperson brings an approved portrait, a script and supported speech generation into one presenter workflow. It is useful when the message benefits from a direct-to-camera format, but a conventional recording is not the right production route. Consent and source rights are part of the job, not an afterthought.",
    proof: [
      "Portrait-led workflow",
      "Script or driving audio",
      "Consent-first production",
    ],
    screenshot: {
      src: screenshot("ai-spokesperson"),
      alt: "AI Spokesperson workspace with a presenter script and motion direction entered but no portrait selected",
      prompt:
        "Meet the campaign idea. The voice, the movement, and the presenter—ready to move from brief to screen.",
    },
    outcomes: [
      {
        title: "Make the message direct",
        description:
          "Use a presenter format for explainers, product introductions and internal communication.",
        icon: "user",
      },
      {
        title: "Join voice and motion",
        description:
          "Keep the presenter image, script, voice direction and output settings in one workflow.",
        icon: "video",
      },
      {
        title: "Plan for responsible use",
        description:
          "Start with explicit rights and consent for every portrait, voice and driving-audio input.",
        icon: "shield",
      },
    ],
    features: [
      {
        title: "Permitted portrait input",
        description:
          "Choose an eligible source image that you own or are authorised to use for avatar generation.",
      },
      {
        title: "Script or supported audio",
        description:
          "Create speech from text or use an eligible driving-audio route when the active model supports it.",
      },
      {
        title: "Motion direction",
        description:
          "Describe the intended gestures, expression and presenter energy for supported workflows.",
      },
      {
        title: "Format controls",
        description:
          "Choose the available output ratio, resolution and duration constraints exposed by the selected model.",
      },
      {
        title: "Model transparency",
        description:
          "Compare the currently published avatar models, providers and customer pricing below.",
      },
      {
        title: "Pre-generation quote",
        description:
          "Nothing billable runs until the authenticated workspace calculates and you approve the quote.",
      },
    ],
    steps: [
      {
        title: "Confirm rights and consent",
        description:
          "Use only a presenter image and voice material with documented permission for this purpose.",
      },
      {
        title: "Prepare the performance",
        description:
          "Add the script or supported driving audio, then set pronunciation and delivery direction.",
      },
      {
        title: "Choose model and format",
        description:
          "Select the enabled avatar workflow and the controls it makes available.",
      },
      {
        title: "Review before publication",
        description:
          "Check lip sync, expression, product claims and disclosure obligations before the video leaves the workspace.",
      },
    ],
    inputs: [
      "A permitted presenter portrait",
      "A script or supported driving audio",
      "Performance and format direction",
    ],
    outputs: [
      "Presenter-led video concepts",
      "Talking-avatar explainers",
      "Workspace video assets for editing",
    ],
    useCases: [
      {
        title: "Product introductions",
        description:
          "Give a concise launch message a recognisable presenter format for social or landing-page use.",
      },
      {
        title: "How-to explainers",
        description:
          "Turn approved scripts into a direct-to-camera structure for demonstrations and education.",
      },
      {
        title: "Internal announcements",
        description:
          "Create repeatable presenter-led communication when a generated format is appropriate and disclosed.",
      },
    ],
    modelCategories: ["avatar"],
    modelIntroduction:
      "These are the presenter and avatar models currently enabled, configured and represented in the public customer catalogue.",
    notes: [
      "Never create a presenter from someone’s likeness or voice without the necessary consent and rights.",
      "Review lip sync and factual claims carefully; generated video should not be treated as a recording of real events.",
      "Follow applicable disclosure, advertising and synthetic-media rules.",
    ],
    relatedContent: [
      {
        href: "/tools/ai-voice-generator",
        label: "AI Voice Generator",
        description:
          "Develop the narration before pairing it with a presenter.",
      },
      {
        href: "/solutions/businesses",
        label: "Business workflows",
        description: "Connect presenter video to broader communication needs.",
      },
      {
        href: "/tools/video-editor",
        label: "Video Editing Desk",
        description: "Trim, caption and assemble the approved presenter take.",
      },
    ],
    questions: [
      {
        question: "What do I need to create an AI spokesperson video?",
        answer:
          "You need a suitable permitted portrait and either a script or supported driving audio, plus the rights and consent required for every source.",
      },
      {
        question: "Can I use a celebrity or employee photo?",
        answer:
          "Only when you have the explicit rights and consent required for synthetic presenter use. A public photo alone is not permission.",
      },
      {
        question: "Can I add my own narration?",
        answer:
          "Supported input varies by model. The workspace shows whether the selected flow accepts generated speech, driving audio or another approved input.",
      },
      {
        question: "Does opening the tool generate anything?",
        answer:
          "No. You can prepare the inputs and review a quote before submitting a billable generation.",
      },
    ],
  },
  {
    slug: "ai-image-editor",
    seoTitle: "AI Image Editor for Retouching, Expansion and Precise Edits",
    seoDescription:
      "Edit, retouch, crop and extend existing images with precise and AI-assisted workflows. Keep source material and campaign context connected.",
    eyebrow: "AI-assisted image editing and retouching",
    hero: "Fix the part that needs work without throwing away the image that already does.",
    introduction:
      "Precision Image Studio is for the second decision, not just the first generation. Bring in an existing visual, work with crop and transform controls, then use supported generative fill, object replacement or outpainting when an AI edit is genuinely useful. The source stays visible and the intent stays specific.",
    proof: [
      "Source-led editing",
      "Generative fill and expansion",
      "Layer-aware production",
    ],
    screenshot: {
      src: screenshot("ai-image-editor"),
      alt: "Precision Image Studio showing source selection, generative edit modes and crop controls before an image is chosen",
      prompt:
        "Warm skin, steady eye contact, natural hair light, preserve wardrobe and jewellery.",
    },
    outcomes: [
      {
        title: "Protect the good parts",
        description:
          "Work from the visual you already have instead of restarting the whole creative direction.",
        icon: "shield",
      },
      {
        title: "Adapt for the next format",
        description:
          "Crop, resize or extend a composition for new placements and campaign ratios.",
        icon: "edit",
      },
      {
        title: "Make intent visible",
        description:
          "Use masks, coordinates and focused prompts where supported to describe the exact area of change.",
        icon: "wand",
      },
    ],
    features: [
      {
        title: "Non-destructive starting point",
        description:
          "Keep the original source available while you explore a more production-ready version.",
      },
      {
        title: "Crop, resize and transform",
        description:
          "Handle the practical framing work around AI-assisted edits in the same focused workspace.",
      },
      {
        title: "Generative fill",
        description:
          "Describe a change within a selected area when the enabled model supports inpainting.",
      },
      {
        title: "Object replacement",
        description:
          "Replace a specific element with clear spatial direction instead of prompting an entirely new image.",
      },
      {
        title: "Outpainting and expansion",
        description:
          "Extend the canvas to a new format while asking the model to continue the surrounding scene.",
      },
      {
        title: "Production handoff",
        description:
          "Save the edited asset for video, campaign layout or MediaKit finishing workflows.",
      },
    ],
    steps: [
      {
        title: "Choose the source",
        description:
          "Upload or select an image you are allowed to edit, and keep the original available for comparison.",
      },
      {
        title: "Name the exact change",
        description:
          "Pick the editing mode, define the affected area and describe what must change—and what must not.",
      },
      {
        title: "Select supported settings",
        description:
          "Choose the active image model and only the controls available for that operation.",
      },
      {
        title: "Review at full size",
        description:
          "Inspect edges, texture, text, anatomy and product details before treating the edit as finished.",
      },
    ],
    inputs: [
      "A permitted source image",
      "A selected region or transform",
      "A focused edit instruction",
    ],
    outputs: [
      "Retouched image versions",
      "Reframed or expanded compositions",
      "Production-ready source assets",
    ],
    useCases: [
      {
        title: "Campaign reframing",
        description:
          "Extend a landscape concept into a vertical composition while preserving the central subject.",
      },
      {
        title: "Product cleanup",
        description:
          "Correct a distracting detail or background area without rebuilding the complete scene.",
      },
      {
        title: "Creative variations",
        description:
          "Explore controlled changes to setting, wardrobe or props while keeping the useful structure.",
      },
    ],
    modelCategories: ["image"],
    modelAvailableIn: ["Image"],
    modelIntroduction:
      "Image-editing support varies by model. The current workspace exposes editing controls only where that capability is configured.",
    notes: [
      "AI edits can unexpectedly alter nearby details. Compare with the source at full resolution.",
      "Product accuracy, identity and legal copy still need human review.",
      "Use source material only when you have permission to modify it.",
    ],
    relatedContent: [
      {
        href: "/tools/ai-image-generator",
        label: "AI Image Generator",
        description:
          "Create the initial visual direction before making controlled edits.",
      },
      {
        href: "/tools/media-toolkit",
        label: "Media Toolkit",
        description:
          "Handle compression, crop, watermarking and other finishing operations.",
      },
      {
        href: "/learn/topics/images",
        label: "Image guides",
        description:
          "Learn practical ways to brief, evaluate and refine AI imagery.",
      },
    ],
    questions: [
      {
        question: "Can I edit an image I already have?",
        answer:
          "Yes. Choose a permitted workspace asset or upload an eligible image, then select the appropriate standard or AI-assisted operation.",
      },
      {
        question: "What is the difference between inpainting and outpainting?",
        answer:
          "Inpainting changes a selected area inside the image. Outpainting extends the canvas and asks the model to continue the scene beyond its original edges.",
      },
      {
        question: "Will the rest of my image remain identical?",
        answer:
          "Not always. Generative edits can affect surrounding details, so compare the result carefully and use the most focused selection available.",
      },
      {
        question: "Are basic edits billable?",
        answer:
          "The workspace shows whether an operation has a credit quote. Review it before submitting any billable processing or generation.",
      },
    ],
  },
  {
    slug: "video-editor",
    seoTitle: "Online AI Video Editor for Creative Workflows",
    seoDescription:
      "Trim, reorder, frame, caption and assemble generated or uploaded clips in one connected video editing workspace.",
    eyebrow: "Timeline-based video editing",
    hero: "Take the useful clips and turn them into one story.",
    introduction:
      "The Video Editing Desk is where isolated takes become a deliberate sequence. Bring in generated or uploaded clips, set the frame, arrange the timeline and prepare a coherent export. It is designed to close the gap between making a clip and making something publishable.",
    proof: [
      "Connected asset library",
      "Timeline assembly",
      "Format and export controls",
    ],
    screenshot: {
      src: screenshot("video-editor"),
      alt: "Video Editing Desk with a vertical campaign project named and an empty timeline ready for clips",
      prompt: "Launch social cut — 9:16",
    },
    outcomes: [
      {
        title: "Lose the weak seconds",
        description:
          "Trim starts and endings so each shot enters with purpose and leaves at the right moment.",
        icon: "edit",
      },
      {
        title: "Control the sequence",
        description:
          "Order clips around the message instead of treating every generated take as a final deliverable.",
        icon: "director",
      },
      {
        title: "Finish for the channel",
        description:
          "Frame the edit for its destination and keep captions, audio and export decisions together.",
        icon: "video",
      },
    ],
    features: [
      {
        title: "Workspace media selection",
        description:
          "Choose uploaded and generated video assets without rebuilding the project in another product.",
      },
      {
        title: "Timeline ordering",
        description:
          "Arrange clips into a simple narrative and see the relationship between takes.",
      },
      {
        title: "Trim and preview",
        description:
          "Tighten the useful range of each clip and review pacing before export.",
      },
      {
        title: "Aspect-ratio planning",
        description:
          "Set the intended frame for landscape, square or vertical delivery.",
      },
      {
        title: "Caption and audio workflow",
        description:
          "Prepare the sequence for supported subtitle, narration and finishing steps.",
      },
      {
        title: "Export preparation",
        description:
          "Name the project, check the timeline and move toward a delivery-ready file.",
      },
    ],
    steps: [
      {
        title: "Set the destination",
        description:
          "Choose the working title and target aspect ratio before the timeline gets crowded.",
      },
      {
        title: "Bring in the best takes",
        description:
          "Select only the generated or uploaded clips that serve the message.",
      },
      {
        title: "Shape the pace",
        description:
          "Trim, reorder and preview the sequence; remove anything that does not earn its time.",
      },
      {
        title: "Check and export",
        description:
          "Review framing, captions, sound and claims before preparing the final output.",
      },
    ],
    inputs: [
      "Generated or uploaded clips",
      "Target aspect ratio",
      "Optional narration, captions and supporting assets",
    ],
    outputs: [
      "Trimmed clips",
      "Ordered short-form sequences",
      "Prepared video exports",
    ],
    useCases: [
      {
        title: "Social campaign edits",
        description:
          "Combine a product reveal, detail shot and closing message into a vertical sequence.",
      },
      {
        title: "Presenter-led explainers",
        description:
          "Tighten an approved spokesperson take and combine it with supporting visual material.",
      },
      {
        title: "Creative pitch reels",
        description:
          "Assemble selected motion concepts into a compact film that communicates the direction.",
      },
    ],
    modelCategories: ["video", "tools"],
    modelIntroduction:
      "The editor works with your assets; the catalogue below shows related generation models and published finishing operations that can feed or support the workflow.",
    notes: [
      "Editing improves structure, but generated source errors still need to be caught at the clip level.",
      "Check captions, music, likeness, branding and claims before export.",
      "Some processing or generation operations may carry their own quote; timeline planning itself does not submit a generation.",
    ],
    relatedContent: [
      {
        href: "/tools/ai-video-generator",
        label: "AI Video Generator",
        description: "Create the shots that feed the timeline.",
      },
      {
        href: "/tools/media-toolkit",
        label: "Media Toolkit",
        description:
          "Prepare or transform compatible video assets before delivery.",
      },
      {
        href: "/solutions/production-teams",
        label: "Production teams",
        description:
          "See how the editor fits into a connected production workflow.",
      },
    ],
    questions: [
      {
        question: "Can I edit generated and uploaded clips together?",
        answer:
          "Yes. Select eligible workspace assets and arrange them in the same editing project.",
      },
      {
        question: "Can I make a vertical video?",
        answer:
          "Yes. Set the project ratio for the intended destination, including supported vertical formats.",
      },
      {
        question: "Does the editor replace full post-production software?",
        answer:
          "It is aimed at focused creative assembly and finishing. Complex compositing, colour and audio-post requirements may still need specialist tools.",
      },
      {
        question: "Does opening an editing project use credits?",
        answer:
          "No generation is submitted merely by opening the editor. Any separately billable operation will present its quote before execution.",
      },
    ],
  },
  {
    slug: "voice-casting",
    seoTitle: "AI Voice Casting and Audition Tool",
    seoDescription:
      "Browse, filter, audition and compare verified AI voices before producing narration. Choose the speaker that fits the message.",
    eyebrow: "Voice audition and selection",
    hero: "Cast the voice before you commit the whole script.",
    introduction:
      "The Voice Casting Booth separates a creative decision from the production job. Filter the available catalogue, use a short audition line and compare speakers in context. Once the role feels right, continue into Voice Studio with a clearer direction.",
    proof: [
      "Verified voice catalogue",
      "Short audition lines",
      "Filter and compare",
    ],
    screenshot: {
      src: screenshot("voice-casting"),
      alt: "Voice Casting Booth filtered to female voices with an example audition line and selectable voice cards",
      prompt:
        "A confident voice can turn a simple product story into something worth remembering.",
    },
    outcomes: [
      {
        title: "Choose with your ears",
        description:
          "Hear the role against real copy instead of deciding from a name and thumbnail.",
        icon: "voice",
      },
      {
        title: "Compare a consistent line",
        description:
          "Use the same short excerpt so differences in tone and delivery are easier to judge.",
        icon: "check",
      },
      {
        title: "Carry the choice forward",
        description:
          "Move from audition into the appropriate speech workflow with a defined voice direction.",
        icon: "arrow",
      },
    ],
    features: [
      {
        title: "Browseable catalogue",
        description:
          "Explore currently available voice options in one focused production view.",
      },
      {
        title: "Useful filters",
        description:
          "Narrow the catalogue by the available language, gender or style metadata.",
      },
      {
        title: "Custom audition line",
        description:
          "Test a concise piece of your own copy so the comparison reflects the real job.",
      },
      {
        title: "Side-by-side evaluation",
        description:
          "Keep candidates visible while you judge clarity, warmth, pace and role fit.",
      },
      {
        title: "Verified options",
        description:
          "The catalogue is designed around approved, available voices rather than arbitrary imitation.",
      },
      {
        title: "Speech workflow handoff",
        description:
          "Continue to a supported synthesis route when the casting decision is made.",
      },
    ],
    steps: [
      {
        title: "Define the role",
        description:
          "Name the audience, personality and delivery qualities the voice needs to carry.",
      },
      {
        title: "Use a short real line",
        description:
          "Pick a representative sentence that exposes pronunciation, rhythm and tone.",
      },
      {
        title: "Filter and audition",
        description:
          "Compare a small shortlist instead of listening to the whole catalogue without a criterion.",
      },
      {
        title: "Select and produce",
        description:
          "Take the chosen voice direction into Voice Studio for the approved script.",
      },
    ],
    inputs: [
      "A short audition line",
      "Language and voice filters",
      "A defined role or audience",
    ],
    outputs: [
      "A voice shortlist",
      "A selected narration direction",
      "A clear handoff to speech synthesis",
    ],
    useCases: [
      {
        title: "Brand narrator",
        description:
          "Find a consistent delivery style for campaign films, explainers and recurring content.",
      },
      {
        title: "Advertisement casting",
        description:
          "Compare whether the script needs warmth, authority, playfulness or restraint.",
      },
      {
        title: "Character direction",
        description:
          "Test how a voice choice changes the perceived personality of dialogue or narration.",
      },
    ],
    modelCategories: ["speech"],
    modelAvailableIn: ["Speech"],
    modelIntroduction:
      "The speech models below are the currently published synthesis routes that can support production after a voice has been selected.",
    notes: [
      "A short audition is directional; test the final script for pronunciation and consistency.",
      "Do not use the tool to imitate an identifiable person without the required rights and consent.",
      "Any billable audition or synthesis displays a quote before submission.",
    ],
    relatedContent: [
      {
        href: "/tools/ai-voice-generator",
        label: "AI Voice Generator",
        description:
          "Turn the approved script into narration with the selected direction.",
      },
      {
        href: "/tools/ai-scriptwriter",
        label: "AI Scriptwriter",
        description: "Prepare voice-friendly copy before the audition.",
      },
      {
        href: "/solutions/production-teams",
        label: "Production teams",
        description: "Connect casting decisions to the wider production flow.",
      },
    ],
    questions: [
      {
        question: "Why audition before generating the whole script?",
        answer:
          "A short representative line makes it faster to compare tone and role fit before spending time or credits on a full narration.",
      },
      {
        question: "Can I filter voices by language?",
        answer:
          "Use the metadata and filters currently available in the Casting Booth. Supported languages still depend on the chosen voice and speech model.",
      },
      {
        question: "Are these cloned celebrity voices?",
        answer:
          "No. The experience is centred on available verified voice options, not unauthorised imitation.",
      },
      {
        question: "Does selecting a voice generate audio?",
        answer:
          "Selection alone does not submit a synthesis job. Review any audition or speech quote before execution.",
      },
    ],
  },
  {
    slug: "ai-creative-director",
    seoTitle: "AI Creative Director for Campaign Ideas and Planning",
    seoDescription:
      "Turn a rough campaign brief into a clearer concept, audience direction, scene plan and connected production workflow.",
    eyebrow: "AI campaign planning and creative direction",
    hero: "Start the campaign with a point of view, not a pile of random prompts.",
    introduction:
      "Creative Director helps you think before you generate. Give it the objective, audience, offer and constraints; then use the conversation to develop a creative territory, visual language, scene direction and practical next steps. It is a planning desk that leads into the production tools, not a substitute for human taste or approval.",
    proof: [
      "Brief development",
      "Campaign and scene direction",
      "Connected next steps",
    ],
    screenshot: {
      src: screenshot("ai-creative-director"),
      alt: "Creative Director workspace with a luxury frankincense campaign brief and suggested starter directions",
      prompt:
        "Plan a three-part launch campaign for a sustainable Omani fragrance house: social reveal, video, and warm in-store storytelling.",
    },
    outcomes: [
      {
        title: "Turn constraints into direction",
        description:
          "Use audience, channel and brand limits to sharpen the idea instead of flattening it.",
        icon: "director",
      },
      {
        title: "Plan the whole creative system",
        description:
          "Connect the central thought to scripts, stills, motion, voice and deliverables.",
        icon: "projects",
      },
      {
        title: "Make feedback more useful",
        description:
          "Give collaborators something specific to challenge: a territory, rationale and production route.",
        icon: "chat",
      },
    ],
    features: [
      {
        title: "Conversational brief building",
        description:
          "Start rough and add the objective, audience, offer, channel, timing and non-negotiables through follow-up turns.",
      },
      {
        title: "Creative territories",
        description:
          "Explore distinct conceptual routes rather than small wording variations of the same first thought.",
      },
      {
        title: "Visual and tonal direction",
        description:
          "Develop useful language for mood, composition, pacing, performance and brand character.",
      },
      {
        title: "Scene and shot planning",
        description:
          "Break a selected route into moments that can move into image, video and spokesperson production.",
      },
      {
        title: "Model choice",
        description:
          "Use currently enabled creative-direction models and compare their published information below.",
      },
      {
        title: "Connected production",
        description:
          "Carry the approved thinking into Scriptwriter, Image Studio, Video Studio and Voice Studio.",
      },
    ],
    steps: [
      {
        title: "Give it the real brief",
        description:
          "Include the commercial objective, audience, proposition, channels, timing and hard constraints.",
      },
      {
        title: "Explore distinct routes",
        description:
          "Ask for meaningfully different territories and challenge anything that feels interchangeable.",
      },
      {
        title: "Choose and develop",
        description:
          "Select a direction, then build its message, visual language, scenes and deliverable plan.",
      },
      {
        title: "Apply human judgement",
        description:
          "Check brand fit, feasibility, originality and claims before handing the route into production.",
      },
    ],
    inputs: [
      "Campaign objective and audience",
      "Brand, channel and legal constraints",
      "Feedback through follow-up conversation",
    ],
    outputs: [
      "Creative territories",
      "Campaign and scene directions",
      "A practical production brief",
    ],
    useCases: [
      {
        title: "Launch campaigns",
        description:
          "Develop a central product idea that can live across social, video, retail and voice.",
      },
      {
        title: "Client brief interpretation",
        description:
          "Turn a dense request into clearer creative choices and questions for the next review.",
      },
      {
        title: "Storyboard planning",
        description:
          "Translate a chosen territory into scenes, shots and production prompts.",
      },
    ],
    modelCategories: ["chat"],
    modelAvailableIn: ["Creative Director"],
    modelIntroduction:
      "The models below are currently published for the Creative Director task. Text pricing is usage-based, and the exact interaction cost depends on token use.",
    notes: [
      "Creative suggestions can be generic or familiar; human critique is essential.",
      "Validate product claims, cultural references and production feasibility independently.",
      "Treat the output as a working brief, not legal, strategic or factual approval.",
    ],
    relatedContent: [
      {
        href: "/solutions/marketing-agencies",
        label: "Marketing agencies",
        description:
          "See an end-to-end path from client brief to campaign assets.",
      },
      {
        href: "/tools/ai-scriptwriter",
        label: "AI Scriptwriter",
        description: "Turn the approved direction into production-ready copy.",
      },
      {
        href: "/learn",
        label: "Learn",
        description:
          "Browse practical creative-production guidance and current articles.",
      },
    ],
    questions: [
      {
        question: "What should I include in a creative brief?",
        answer:
          "Start with the objective, audience, proposition, proof, channels, timing, budget reality, brand rules and anything the idea must avoid.",
      },
      {
        question: "Can it make the campaign assets too?",
        answer:
          "Creative Director plans the route. Continue into the connected image, video, voice and editing tools to produce the media.",
      },
      {
        question: "Will every idea be original?",
        answer:
          "No model can guarantee originality. Use the output as a stimulus, check for familiar concepts and apply experienced human creative judgement.",
      },
      {
        question: "Is chatting billable?",
        answer:
          "Published text models are priced by usage. The authenticated experience applies the current pricing configuration; see the public references below.",
      },
    ],
  },
  {
    slug: "ai-scriptwriter",
    seoTitle: "AI Scriptwriter for Ads, Social Video and Brand Stories",
    seoDescription:
      "Draft and refine commercial scripts, hooks, narration and dialogue in a focused AI writing workspace connected to production tools.",
    eyebrow: "Advertising and video script development",
    hero: "Get the idea into words people can say, hear and remember.",
    introduction:
      "Scriptwriter is a focused writing desk for commercial and creative production. Give it the audience, channel, duration and message; develop a structured first draft; then refine the hook, rhythm, dialogue and call to action. The useful result is not ‘finished by AI’—it is a stronger working script ready for human editing and production.",
    proof: [
      "Commercial and narrative modes",
      "Iterative rewrite tools",
      "Voice and video handoff",
    ],
    screenshot: {
      src: screenshot("ai-scriptwriter"),
      alt: "Scriptwriter desk with an advertising brief, a draft script and rewrite controls",
      prompt:
        "Write a 30-second vertical video script for a luxury Omani fragrance launch, with a visual hook and a confident final line.",
    },
    outcomes: [
      {
        title: "Find the hook early",
        description:
          "Test how the first seconds earn attention before production decisions become expensive.",
        icon: "sparkles",
      },
      {
        title: "Write to the format",
        description:
          "Shape the copy around duration, channel, visuals, narration and the action you need from the audience.",
        icon: "script",
      },
      {
        title: "Revise with intent",
        description:
          "Ask for a shorter, warmer, clearer or more cinematic version instead of accepting the first draft.",
        icon: "edit",
      },
    ],
    features: [
      {
        title: "Structured first drafts",
        description:
          "Develop hooks, scene beats, voiceover, dialogue and calls to action from a clear brief.",
      },
      {
        title: "Commercial formats",
        description:
          "Work on social ads, product videos, explainers and presenter scripts with relevant duration constraints.",
      },
      {
        title: "Narrative support",
        description:
          "Explore story beats, character intention and dialogue when the piece needs more than a sales line.",
      },
      {
        title: "Rewrite controls",
        description:
          "Continue, polish, shorten or change the tone while keeping the draft visible.",
      },
      {
        title: "Model transparency",
        description:
          "See which published text models are available for scripts and how usage is billed.",
      },
      {
        title: "Production connection",
        description:
          "Take the approved script into voice, spokesperson, video or Creative Director workflows.",
      },
    ],
    steps: [
      {
        title: "Brief the job",
        description:
          "State the audience, channel, duration, single message, proof and desired next action.",
      },
      {
        title: "Generate a working structure",
        description:
          "Ask for a format that production can use: hook, scenes, spoken copy and close.",
      },
      {
        title: "Read it aloud",
        description:
          "Catch stiff phrasing, overcrowded sentences and timing problems with a human voice.",
      },
      {
        title: "Rewrite and approve",
        description:
          "Refine for tone, accuracy and brand fit before sending the copy into narration or video.",
      },
    ],
    inputs: [
      "Audience, channel and duration",
      "Message, evidence and desired action",
      "Brand tone and production constraints",
    ],
    outputs: [
      "Advertising scripts",
      "Narration and presenter copy",
      "Dialogue, hooks and scene outlines",
    ],
    useCases: [
      {
        title: "Short social ads",
        description:
          "Write a clear hook, visual progression and final action for a constrained vertical format.",
      },
      {
        title: "Product explainers",
        description:
          "Turn features into a spoken story with a useful structure and credible proof.",
      },
      {
        title: "Brand films",
        description:
          "Explore a more expressive narration route around origin, purpose or product experience.",
      },
    ],
    modelCategories: ["chat"],
    modelAvailableIn: ["Scripts"],
    modelIntroduction:
      "These text models are currently enabled and published for Scriptwriter. Their customer references use token-based pricing where configured.",
    notes: [
      "Fact-check every claim, statistic, name and product detail.",
      "Read the script aloud and time it before locking the production plan.",
      "AI suggestions may echo familiar language; check originality and brand distinctiveness.",
    ],
    relatedContent: [
      {
        href: "/tools/ai-creative-director",
        label: "AI Creative Director",
        description:
          "Build the campaign territory before writing the final script.",
      },
      {
        href: "/tools/ai-voice-generator",
        label: "AI Voice Generator",
        description: "Hear the approved words as narration.",
      },
      {
        href: "/solutions/social-media-creators",
        label: "Social media creators",
        description:
          "See how scripts connect to a repeatable content workflow.",
      },
    ],
    questions: [
      {
        question: "Can it write a 15- or 30-second ad?",
        answer:
          "Yes. State the intended duration and channel, then read and time the result because natural delivery speed varies.",
      },
      {
        question: "Can I revise the draft?",
        answer:
          "Yes. Use follow-up instructions and the available rewrite actions to shorten, continue, polish or shift the tone.",
      },
      {
        question: "Does it fact-check product claims?",
        answer:
          "No. You must verify claims, evidence, pricing, legal copy and regulated statements before production.",
      },
      {
        question: "Which models power Scriptwriter?",
        answer:
          "The live published list below shows enabled models available for the Scripts task, subject to current configuration.",
      },
    ],
  },
  {
    slug: "character-chat",
    seoTitle: "AI Character Chat for Dialogue and Persona Development",
    seoDescription:
      "Develop dialogue, perspective and fictional personas through focused multi-turn AI character conversations, with optional supported voice experiences.",
    eyebrow: "Conversational AI characters",
    hero: "Talk to the character until the voice stops feeling like a label.",
    introduction:
      "Character Chat gives creative conversation a point of view. Choose or define a persona, give it a situation and use follow-up turns to explore motivation, dialogue and reaction. It is useful for writers and creative teams who need to test a character from the inside—not for pretending generated conversation is a real person.",
    proof: [
      "Multi-turn persona chat",
      "Custom creative context",
      "Optional supported voice",
    ],
    screenshot: {
      src: screenshot("character-chat"),
      alt: "Character Chat with the Creative Muse persona selected and a world-building question entered but not sent",
      prompt:
        "You are the curator of a scent museum. Help me shape a short mystery scene around a vanished star chart.",
    },
    outcomes: [
      {
        title: "Hear the point of view",
        description:
          "Test how a character notices, avoids and responds instead of describing them from the outside.",
        icon: "chat",
      },
      {
        title: "Pressure-test dialogue",
        description:
          "Put the persona in a specific situation and see where the voice becomes inconsistent or generic.",
        icon: "script",
      },
      {
        title: "Find unexpected material",
        description:
          "Use conversation to surface tensions, details and questions worth taking back into the script.",
        icon: "sparkles",
      },
    ],
    features: [
      {
        title: "Built-in personas",
        description:
          "Start quickly with a defined creative role when a blank page is the main problem.",
      },
      {
        title: "Custom persona direction",
        description:
          "Define the character’s goals, limits, voice and context for the conversation you need.",
      },
      {
        title: "Multi-turn continuity",
        description:
          "Develop an idea through follow-up questions instead of restarting from a single prompt.",
      },
      {
        title: "Scenario starters",
        description:
          "Use a conflict, place, interview or creative exercise to give the conversation momentum.",
      },
      {
        title: "Optional voice mode",
        description:
          "Use supported voice interaction where available and appropriate for the selected persona and model.",
      },
      {
        title: "Writing handoff",
        description:
          "Take useful dialogue and insight into Scriptwriter or a broader story-planning workflow.",
      },
    ],
    steps: [
      {
        title: "Choose the purpose",
        description:
          "Decide whether you are exploring voice, backstory, conflict, dialogue or another specific question.",
      },
      {
        title: "Define the persona",
        description:
          "Set motivation, perspective, relevant history and clear boundaries for the role.",
      },
      {
        title: "Enter a concrete scene",
        description:
          "Give the character somewhere to stand, something to want and a reason the moment matters.",
      },
      {
        title: "Interrogate the useful parts",
        description:
          "Follow contradictions and surprising details, then edit the strongest material in your own voice.",
      },
    ],
    inputs: [
      "A persona or creative role",
      "A situation, question or conflict",
      "Follow-up conversation",
    ],
    outputs: [
      "Dialogue explorations",
      "Character perspective and backstory",
      "Material for scripts and story planning",
    ],
    useCases: [
      {
        title: "Dialogue rehearsal",
        description:
          "Explore how a character might respond under pressure before shaping the actual scene.",
      },
      {
        title: "Persona development",
        description:
          "Build a clearer set of motives, contradictions, habits and boundaries through conversation.",
      },
      {
        title: "Creative roleplay",
        description:
          "Invite a guided point of view—such as a curator or critic—to unlock a different angle on the work.",
      },
    ],
    modelCategories: ["chat"],
    modelAvailableIn: ["Character Chat"],
    modelIntroduction:
      "The models below are currently enabled and publicly priced for the Character Chat task. Availability can change with workspace configuration.",
    notes: [
      "Characters are generated constructs, not real people or authoritative sources.",
      "Avoid entering confidential personal information into a persona prompt.",
      "Edit and verify any material before using it in a production script.",
    ],
    relatedContent: [
      {
        href: "/tools/ai-scriptwriter",
        label: "AI Scriptwriter",
        description:
          "Turn dialogue experiments into a structured scene or production script.",
      },
      {
        href: "/tools/ai-creative-director",
        label: "AI Creative Director",
        description:
          "Connect character insight to the wider campaign or story direction.",
      },
      {
        href: "/learn",
        label: "Learn",
        description:
          "Explore current writing and creative-production guidance.",
      },
    ],
    questions: [
      {
        question: "Can I create my own character?",
        answer:
          "Yes. Define a custom persona with a purpose, perspective, voice and boundaries, then start it in a concrete scenario.",
      },
      {
        question: "Does the character remember the conversation?",
        answer:
          "The current chat uses the available conversation context. Treat important details as working material and save them in your project or script.",
      },
      {
        question: "Can characters speak aloud?",
        answer:
          "Optional voice experiences depend on the available model and workspace configuration.",
      },
      {
        question: "Is a character’s answer factual?",
        answer:
          "Not necessarily. The persona is a creative device; verify any factual statement independently.",
      },
    ],
  },
  {
    slug: "media-toolkit",
    seoTitle: "AI Media Toolkit for Image and Video Finishing",
    seoDescription:
      "Compress, crop, watermark, enhance and transform compatible media with a clear catalogue of published image and video operations.",
    eyebrow: "Media finishing and transformation",
    hero: "Handle the practical media jobs that happen after the big creative idea.",
    introduction:
      "MediaKit brings focused image and video operations into one catalogue: the work that prepares an asset for delivery, adapts it to a channel or solves a specific technical problem. Choose the operation first, supply the required source and see its quote before processing. No mystery ‘enhance’ button pretending every job is the same.",
    proof: [
      "Image and video operations",
      "Source validation",
      "Quote before processing",
    ],
    screenshot: {
      src: screenshot("media-toolkit"),
      alt: "MediaKit Tools catalogue showing image operations including face blur, compression, crop and intelligent compression",
      prompt:
        "Image tools selected — choose an operation before adding source media.",
    },
    outcomes: [
      {
        title: "Prepare assets for delivery",
        description:
          "Reduce size, adjust framing or apply a supported protection step before publication.",
        icon: "wand",
      },
      {
        title: "Choose the job explicitly",
        description:
          "Start from a named operation with defined inputs instead of an ambiguous all-purpose processor.",
        icon: "check",
      },
      {
        title: "Keep finishing connected",
        description:
          "Use assets already in the workspace and save processed results back beside the campaign.",
        icon: "assets",
      },
    ],
    features: [
      {
        title: "Categorised operation catalogue",
        description:
          "Browse image, video-finishing and analysis tasks from a single public-facing toolkit.",
      },
      {
        title: "Image preparation",
        description:
          "Use currently published operations such as compatible compression, crop, watermarking or privacy treatments.",
      },
      {
        title: "Video finishing",
        description:
          "Choose from enabled transformations and preparation tools for supported video sources.",
      },
      {
        title: "Source checks",
        description:
          "Each operation asks for the media and settings it requires rather than accepting an invalid job silently.",
      },
      {
        title: "Published operation list",
        description:
          "The live catalogue below includes only enabled, configured tools with public customer pricing.",
      },
      {
        title: "Clear preflight",
        description:
          "Review any credit quote before execution; opening and browsing the catalogue is not billable.",
      },
    ],
    steps: [
      {
        title: "Choose the exact operation",
        description:
          "Start with the outcome—compression, crop, watermark or another currently published task.",
      },
      {
        title: "Add a compatible source",
        description:
          "Select or upload media you are allowed to process and check the operation’s requirements.",
      },
      {
        title: "Set only what matters",
        description:
          "Complete the controls relevant to that operation and review the current quote.",
      },
      {
        title: "Process and inspect",
        description:
          "Run the job, compare the result with the source and save the useful version to the workspace.",
      },
    ],
    inputs: [
      "A compatible image or video",
      "A selected media operation",
      "Operation-specific controls",
    ],
    outputs: [
      "Compressed or reframed assets",
      "Protected or privacy-adjusted media",
      "Processed files ready for delivery",
    ],
    useCases: [
      {
        title: "Web-ready images",
        description:
          "Prepare a campaign visual for practical delivery without losing track of the higher-quality source.",
      },
      {
        title: "Format adaptation",
        description:
          "Use a focused crop or other supported transformation for a new placement.",
      },
      {
        title: "Media protection and privacy",
        description:
          "Apply available watermarking or face-blur operations when the job requires them.",
      },
    ],
    modelCategories: ["tools"],
    modelAvailableIn: ["Media Tools"],
    modelIntroduction:
      "This list comes directly from the current public operation catalogue and only includes tools that are enabled, configured and priced for customers.",
    notes: [
      "Operation availability depends on the active provider configuration and can change.",
      "Keep an original copy and inspect processed output before replacing a production asset.",
      "The authenticated quote is authoritative for the selected source and settings.",
    ],
    relatedContent: [
      {
        href: "/tools/ai-image-editor",
        label: "AI Image Editor",
        description:
          "Use a more directed editing workspace for creative image changes.",
      },
      {
        href: "/tools/video-editor",
        label: "Video Editing Desk",
        description: "Assemble and trim clips before final media preparation.",
      },
      {
        href: "/pricing",
        label: "Pricing",
        description: "Browse the full published model and operation catalogue.",
      },
    ],
    questions: [
      {
        question: "Which operations are available?",
        answer:
          "The live list below shows currently enabled and publicly priced operations. The catalogue can change as provider capabilities are configured.",
      },
      {
        question: "Can I browse without uploading media?",
        answer:
          "Yes. Explore the catalogue and operation descriptions before choosing a source.",
      },
      {
        question: "Does every operation use AI?",
        answer:
          "No. MediaKit includes practical processing and transformation operations as well as AI-assisted tools where configured.",
      },
      {
        question: "When do credits apply?",
        answer:
          "Any billable operation presents its current quote after you select the source and settings, before processing begins.",
      },
    ],
  },
  {
    slug: "pixel-ai",
    seoTitle: "Pixel AI Creative Assistant and Workspace Copilot",
    seoDescription:
      "Ask Pixel for model guidance, prompt improvement, tool discovery and practical creative help without leaving your current Aiwa Creators workflow.",
    eyebrow: "Conversational creative assistance",
    hero: "Ask the small question that keeps the creative work moving.",
    introduction:
      "Pixel is the workspace companion for moments when you know the outcome but not the next click. Ask which model suits a job, how to improve a prompt, where a tool lives or what to try next. Because Pixel opens over the current workspace, guidance stays close to the task instead of becoming another disconnected conversation.",
    proof: [
      "Available across the workspace",
      "Model and tool guidance",
      "Prompt assistance",
    ],
    screenshot: {
      src: screenshot("pixel-ai"),
      alt: "Pixel AI assistant opened over MediaKit with a model-selection question entered but not sent",
      prompt:
        "Which model should I use to turn a product photo into a calm 9:16 launch video?",
    },
    outcomes: [
      {
        title: "Find the right starting point",
        description:
          "Describe the outcome and let Pixel point you toward the relevant tool or workflow.",
        icon: "search",
      },
      {
        title: "Make prompts more useful",
        description:
          "Turn a thin idea into a clearer brief with subject, setting, motion, audience and format.",
        icon: "sparkles",
      },
      {
        title: "Understand the options",
        description:
          "Ask for practical differences between available models and supported capabilities.",
        icon: "chat",
      },
    ],
    features: [
      {
        title: "Workspace-wide access",
        description:
          "Open Pixel while you are using the creative and media tools instead of changing products.",
      },
      {
        title: "Tool discovery",
        description:
          "Ask where to create, edit, narrate, process or plan a particular piece of work.",
      },
      {
        title: "Model guidance",
        description:
          "Get a practical starting recommendation, then confirm current support in the published catalogue and Studio controls.",
      },
      {
        title: "Prompt development",
        description:
          "Add the missing visual, motion, tone or audience details to a rough creative thought.",
      },
      {
        title: "Asset and workflow help",
        description:
          "Use the assistant to understand how saved media and connected tools fit together.",
      },
      {
        title: "Human-controlled action",
        description:
          "Pixel can guide the work; generation and processing still require your explicit review and submission.",
      },
    ],
    steps: [
      {
        title: "Open Pixel in context",
        description:
          "Use the assistant from the workspace page where the question came up.",
      },
      {
        title: "State the outcome",
        description:
          "Say what you need to make, for whom, in which format and what source material you have.",
      },
      {
        title: "Challenge the suggestion",
        description:
          "Ask why a model or route fits, what trade-offs matter and what information is still missing.",
      },
      {
        title: "Continue in the tool",
        description:
          "Use the guidance as a starting point, then verify controls, quotes and results in the relevant workflow.",
      },
    ],
    inputs: [
      "A creative goal or workspace question",
      "Available source material and constraints",
      "Follow-up questions",
    ],
    outputs: [
      "Tool and model guidance",
      "Stronger working prompts",
      "Practical next steps",
    ],
    useCases: [
      {
        title: "Model selection",
        description:
          "Compare the kind of model suited to a task before working through every catalogue entry.",
      },
      {
        title: "Prompt rescue",
        description:
          "Turn ‘make this cinematic’ into a specific, testable direction for camera, light, pacing and format.",
      },
      {
        title: "Workflow navigation",
        description:
          "Work out whether the next step belongs in Image Studio, Precision Image, MediaKit or another tool.",
      },
    ],
    modelCategories: ["chat"],
    modelIntroduction:
      "Pixel uses the configured assistant experience. The broader live chat and reasoning catalogue below shows published text models available across conversational workflows.",
    notes: [
      "Pixel’s guidance can be incomplete or wrong; verify model support, prices, facts and rights in the relevant source of truth.",
      "Do not share confidential, personal or restricted information unless your organisation has approved that use.",
      "The assistant does not submit a generation merely because it recommends a workflow.",
    ],
    relatedContent: [
      {
        href: "/tools/ai-creative-director",
        label: "AI Creative Director",
        description:
          "Use a dedicated planning space when the whole campaign needs direction.",
      },
      {
        href: "/tools",
        label: "All tools",
        description: "Browse every public creative and finishing workflow.",
      },
      {
        href: "/learn",
        label: "Learn",
        description:
          "Go deeper with current product and creative-production guidance.",
      },
    ],
    questions: [
      {
        question: "Can Pixel create media for me?",
        answer:
          "Pixel helps you choose and prepare the workflow. The relevant Studio or tool still shows the inputs, settings and quote before you explicitly submit work.",
      },
      {
        question: "Does Pixel know which models are available?",
        answer:
          "It can help interpret the configured product catalogue, but always confirm current availability and controls in the relevant Studio and public pricing list.",
      },
      {
        question: "Can Pixel improve a prompt?",
        answer:
          "Yes. Give it the rough idea, intended audience, format and source material, then ask it to expose missing creative decisions rather than merely adding adjectives.",
      },
      {
        question: "Is Pixel a factual authority?",
        answer:
          "No. Treat it as creative and product guidance, then verify important facts, legal requirements, rights, model availability and prices.",
      },
    ],
  },
];

export function toolLandingBySlug(slug: string): ToolLanding | undefined {
  return toolLandings.find((landing) => landing.slug === slug);
}

export function modelsForToolLanding(
  landing: ToolLanding,
  catalogue: readonly PublicPricingItem[],
): PublicPricingItem[] {
  const categoryMatches = catalogue.filter((item) =>
    landing.modelCategories.includes(item.category),
  );
  if (!landing.modelAvailableIn?.length) return categoryMatches;
  const taskMatches = categoryMatches.filter((item) =>
    item.availableIn.some((label) => landing.modelAvailableIn?.includes(label)),
  );
  return taskMatches.length ? taskMatches : categoryMatches;
}
