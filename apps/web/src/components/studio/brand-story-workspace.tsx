"use client";

import {
  CreativeLocaleButton,
  useCreativeLocale,
} from "@/components/studio/creative-locale-selector";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CreativeSurface, Eyebrow } from "@/components/ui/creative";
import { Icon } from "@/components/ui/icon";
import {
  StudioModelSelect,
  type StudioModelOption,
} from "@/components/studio/studio-model-select";
import { runQuotedTextFeature } from "@/lib/text-feature-client";

interface BrandProfile {
  id: string;
  name: string;
  tagline: string | null;
  voiceTone: string | null;
  guidelines: string | null;
  targetAudience: string | null;
  vocabulary?: string[] | null;
  createdAt: string;
  updatedAt: string;
}

interface StoryBeat {
  act: string;
  beat: string;
  summary: string;
  conflict?: string;
}

interface CharacterProfile {
  name: string;
  role: string;
  motivation: string;
  flaw?: string;
}

interface StoryPlan {
  id: string;
  title: string;
  genre?: string | null;
  premise?: string | null;
  structureType: string;
  beats: StoryBeat[];
  characters: CharacterProfile[];
  createdAt: string;
  updatedAt: string;
}

export function BrandStoryWorkspace({
  organizationSlug,
  organizationId,
  canGenerate,
  initialTab,
  brandDefaultModelId,
  brandModels,
  storyDefaultModelId,
  storyModels,
}: {
  organizationSlug: string;
  organizationId: string;
  canGenerate: boolean;
  initialTab: "brand" | "story";
  brandDefaultModelId: string | null;
  brandModels: StudioModelOption[];
  storyDefaultModelId: string | null;
  storyModels: StudioModelOption[];
}) {
  const [localeIntent, setLocaleIntent] = useCreativeLocale(organizationId);
  const [activeTab, setActiveTab] = useState<"brand" | "story">(initialTab);

  // Brand Profiles State
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<BrandProfile | null>(null);
  const [isGeneratingBrand, setIsGeneratingBrand] = useState(false);
  const [selectedBrandModel, setSelectedBrandModel] = useState(
    brandDefaultModelId ?? brandModels[0]?.id ?? "",
  );
  const [brandForm, setBrandForm] = useState({
    name: "",
    industry: "",
    vision: "",
    targetMarket: "",
  });

  // Story Plans State
  const [storyPlans, setStoryPlans] = useState<StoryPlan[]>([]);
  const [selectedStory, setSelectedStory] = useState<StoryPlan | null>(null);
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [selectedStoryModel, setSelectedStoryModel] = useState(
    storyDefaultModelId ?? storyModels[0]?.id ?? "",
  );
  const [storyForm, setStoryForm] = useState({
    title: "",
    premise: "",
    genre: "Cinematic Drama",
    structureType: "THREE_ACT",
  });

  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Load brand profiles & story plans
  useEffect(() => {
    async function loadData() {
      try {
        const [brandRes, storyRes] = await Promise.all([
          fetch(
            `/api/brand-profiles?organizationId=${encodeURIComponent(organizationId)}`,
          ),
          fetch(
            `/api/story-plans?organizationId=${encodeURIComponent(organizationId)}`,
          ),
        ]);

        if (brandRes.ok) {
          const data = await brandRes.json();
          setBrandProfiles(data.profiles || []);
          if (data.profiles?.length) {
            setSelectedBrand(data.profiles[0]);
          }
        }

        if (storyRes.ok) {
          const data = await storyRes.json();
          setStoryPlans(data.storyPlans || []);
          if (data.storyPlans?.length) {
            setSelectedStory(data.storyPlans[0]);
          }
        }
      } catch (err) {
        console.error("Failed to load brand & story data", err);
      }
    }
    loadData();
  }, [organizationId]);

  async function handleGenerateBrand(e: React.FormEvent) {
    e.preventDefault();
    if (!brandForm.name.trim() || isGeneratingBrand || !selectedBrandModel)
      return;

    setIsGeneratingBrand(true);
    setStatusNotice(null);

    try {
      const data = await runQuotedTextFeature<{
        profile: {
          tagline?: string;
          voiceTone?: string;
          guidelines?: string;
          targetAudience?: string;
          vocabulary?: string[];
        };
      }>("/api/brand-profiles/generate", {
        organizationId,
        brandName: brandForm.name,
        industry: brandForm.industry || undefined,
        vision: brandForm.vision || undefined,
        targetMarket: brandForm.targetMarket || undefined,
        modelId: selectedBrandModel,
        localeIntent,
      });
      const generated = data.profile;

      // Save as permanent brand profile
      const saveRes = await fetch("/api/brand-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          name: brandForm.name,
          tagline: generated.tagline || null,
          voiceTone: generated.voiceTone || null,
          guidelines: generated.guidelines || null,
          targetAudience: generated.targetAudience || null,
          vocabulary: generated.vocabulary || null,
        }),
      });

      if (saveRes.ok) {
        const savedData = await saveRes.json();
        setBrandProfiles((prev) => [savedData.profile, ...prev]);
        setSelectedBrand(savedData.profile);
        setStatusNotice("Brand guidelines created and saved!");
        setTimeout(() => setStatusNotice(null), 4000);
      }
    } catch (err) {
      setStatusNotice(
        err instanceof Error ? err.message : "Generation failed.",
      );
    } finally {
      setIsGeneratingBrand(false);
    }
  }

  async function handleGenerateStory(e: React.FormEvent) {
    e.preventDefault();
    if (
      !storyForm.title.trim() ||
      !storyForm.premise.trim() ||
      isGeneratingStory ||
      !selectedStoryModel
    )
      return;

    setIsGeneratingStory(true);
    setStatusNotice(null);

    try {
      const data = await runQuotedTextFeature<{
        beats: StoryBeat[];
        characters: CharacterProfile[];
      }>("/api/story-plans/generate", {
        organizationId,
        title: storyForm.title,
        premise: storyForm.premise,
        genre: storyForm.genre,
        structureType: storyForm.structureType,
        modelId: selectedStoryModel,
        localeIntent,
      });

      // Save story plan
      const saveRes = await fetch("/api/story-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          title: storyForm.title,
          genre: storyForm.genre,
          premise: storyForm.premise,
          structureType: storyForm.structureType,
          beats: data.beats,
          characters: data.characters,
        }),
      });

      if (saveRes.ok) {
        const savedData = await saveRes.json();
        setStoryPlans((prev) => [savedData.storyPlan, ...prev]);
        setSelectedStory(savedData.storyPlan);
        setStatusNotice("Story beat sheet created and saved!");
        setTimeout(() => setStatusNotice(null), 4000);
      }
    } catch (err) {
      setStatusNotice(
        err instanceof Error ? err.message : "Story generation failed.",
      );
    } finally {
      setIsGeneratingStory(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-65px)] max-w-[1600px] flex-col p-4 sm:p-6 lg:p-8">
      {/* Studio Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Eyebrow>Brand Strategy & Narrative Architecture</Eyebrow>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">
              Task-aware model routing
            </span>
          </div>
          <h1 className="font-display mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Brand & Story
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Formulate brand voice pillars and architect multi-act story beat
            sheets before production.
          </p>
        </div>

        <CreativeLocaleButton value={localeIntent} onChange={setLocaleIntent} disabled={isGeneratingBrand || isGeneratingStory} />
        {/* Tab Toggle */}
        <div className="flex rounded-xl border border-border bg-card p-1 shadow-xs">
          <button
            onClick={() => setActiveTab("brand")}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
              activeTab === "brand"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon name="brand" className="size-3.5" />
            Brand Identity & Voice
          </button>
          <button
            onClick={() => setActiveTab("story")}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
              activeTab === "story"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon name="story" className="size-3.5" />
            Story Planning & Beats
          </button>
        </div>
      </div>

      {statusNotice && (
        <div className="mt-2 rounded-xl border border-primary/40 bg-primary/10 p-2 text-center text-xs font-semibold text-primary">
          {statusNotice}
        </div>
      )}

      {/* Main Tab Content */}
      {activeTab === "brand" ? (
        /* Brand Identity Tab */
        <div className="mt-4 grid min-h-0 flex-1 gap-6 lg:grid-cols-[300px_1fr_360px]">
          {/* Brand Library */}
          <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card/60 p-3">
            <div className="px-2 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Brand Profiles
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {brandProfiles.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">
                  No brand profiles yet. Create one with the AI form on the
                  right.
                </p>
              ) : (
                brandProfiles.map((p) => {
                  const isActive = selectedBrand?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedBrand(p)}
                      className={`flex w-full flex-col rounded-xl p-3 text-left transition ${
                        isActive
                          ? "border border-primary/50 bg-primary/10 text-primary"
                          : "border border-border bg-surface-sunken text-foreground hover:border-border/80"
                      }`}
                    >
                      <span className="text-xs font-bold truncate">
                        {p.name}
                      </span>
                      {p.tagline && (
                        <span className="mt-1 line-clamp-1 text-[10px] text-muted-foreground">
                          &quot;{p.tagline}&quot;
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Active Brand Display */}
          <CreativeSurface className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 sm:p-8">
            {selectedBrand ? (
              <div className="space-y-6">
                <div className="border-b border-border pb-4">
                  <Eyebrow>Brand Identity Guide</Eyebrow>
                  <h2 className="font-display mt-2 text-2xl font-bold text-foreground">
                    {selectedBrand.name}
                  </h2>
                  {selectedBrand.tagline && (
                    <p className="mt-1 font-hand text-lg text-primary">
                      &quot;{selectedBrand.tagline}&quot;
                    </p>
                  )}
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-surface-sunken p-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                      Tone of Voice & Temperament
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                      {selectedBrand.voiceTone || "No voice tone specified."}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border bg-surface-sunken p-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                      Target Audience Persona
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                      {selectedBrand.targetAudience ||
                        "No audience persona specified."}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-surface-sunken p-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                    Core Messaging Pillars & Guidelines
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                    {selectedBrand.guidelines || "No guidelines specified."}
                  </p>
                </div>

                {selectedBrand.vocabulary &&
                  selectedBrand.vocabulary.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Brand Vocabulary & Key Expressions
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedBrand.vocabulary.map((w, i) => (
                          <span
                            key={i}
                            className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
                          >
                            {w}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            ) : (
              <div className="grid h-full place-items-center text-center">
                <div className="max-w-sm">
                  <Icon name="brand" className="mx-auto size-10 text-primary" />
                  <h3 className="font-display mt-3 text-lg font-bold text-foreground">
                    Define Your Brand Voice
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Use the AI Strategist on the right to architect distinct
                    brand guidelines.
                  </p>
                </div>
              </div>
            )}
          </CreativeSurface>

          {/* AI Brand Strategist Generator */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-xs overflow-y-auto">
            <Eyebrow>Brand Strategy Model</Eyebrow>
            <h3 className="font-display mt-2 text-base font-bold text-foreground">
              Generate Brand Voice
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Generate structured brand voice, audience, messaging, and
              vocabulary with a verified strategy model.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-foreground">
                Strategy Model
              </label>
              <StudioModelSelect
                models={brandModels}
                value={selectedBrandModel}
                onChange={(value) => {
                  setSelectedBrandModel(value);
                  setStatusNotice(null);
                }}
                ariaLabel="Brand strategy model"
                className="mt-1 w-full"
              />
            </div>

            <form onSubmit={handleGenerateBrand} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Brand Name *
                </label>
                <input
                  type="text"
                  required
                  value={brandForm.name}
                  onChange={(e) =>
                    setBrandForm({ ...brandForm, name: e.target.value })
                  }
                  placeholder="e.g. Al-Luban Heritage"
                  className="mt-1 w-full rounded-xl border border-border bg-surface-sunken p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Industry / Sector
                </label>
                <input
                  type="text"
                  value={brandForm.industry}
                  onChange={(e) =>
                    setBrandForm({ ...brandForm, industry: e.target.value })
                  }
                  placeholder="e.g. Luxury Frankincense & Wellness"
                  className="mt-1 w-full rounded-xl border border-border bg-surface-sunken p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Vision / Mission
                </label>
                <textarea
                  rows={2}
                  value={brandForm.vision}
                  onChange={(e) =>
                    setBrandForm({ ...brandForm, vision: e.target.value })
                  }
                  placeholder="e.g. Reconnect modern living with ancient Omani natural remedies..."
                  className="mt-1 w-full rounded-xl border border-border bg-surface-sunken p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Target Audience
                </label>
                <input
                  type="text"
                  value={brandForm.targetMarket}
                  onChange={(e) =>
                    setBrandForm({ ...brandForm, targetMarket: e.target.value })
                  }
                  placeholder="e.g. Mindful travelers, luxury seekers"
                  className="mt-1 w-full rounded-xl border border-border bg-surface-sunken p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <Button
                type="submit"
                size="sm"
                className="w-full"
                disabled={
                  !brandForm.name.trim() ||
                  isGeneratingBrand ||
                  !canGenerate ||
                  !selectedBrandModel
                }
              >
                {isGeneratingBrand ? "Strategizing..." : "Generate Brand Voice"}
              </Button>
            </form>
          </div>
        </div>
      ) : (
        /* Story Planning Tab */
        <div className="mt-4 grid min-h-0 flex-1 gap-6 lg:grid-cols-[300px_1fr_360px]">
          {/* Story Plans Library */}
          <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card/60 p-3">
            <div className="px-2 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Story Outlines
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {storyPlans.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">
                  No story plans yet. Architect one with the AI form on the
                  right.
                </p>
              ) : (
                storyPlans.map((sp) => {
                  const isActive = selectedStory?.id === sp.id;
                  return (
                    <button
                      key={sp.id}
                      onClick={() => setSelectedStory(sp)}
                      className={`flex w-full flex-col rounded-xl p-3 text-left transition ${
                        isActive
                          ? "border border-primary/50 bg-primary/10 text-primary"
                          : "border border-border bg-surface-sunken text-foreground hover:border-border/80"
                      }`}
                    >
                      <span className="text-xs font-bold truncate">
                        {sp.title}
                      </span>
                      {sp.genre && (
                        <span className="mt-1 text-[10px] text-muted-foreground">
                          {sp.genre} · {sp.structureType}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Active Story Beat Sheet */}
          <CreativeSurface className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 sm:p-8">
            {selectedStory ? (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
                  <div>
                    <Eyebrow>
                      {selectedStory.structureType.replace("_", " ")} BEAT SHEET
                    </Eyebrow>
                    <h2 className="font-display mt-2 text-2xl font-bold text-foreground">
                      {selectedStory.title}
                    </h2>
                    {selectedStory.premise && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selectedStory.premise}
                      </p>
                    )}
                  </div>

                  <Button
                    asChild
                    size="sm"
                    variant="secondary"
                    className="gap-1.5"
                  >
                    <Link href={`/app/${organizationSlug}/scripts` as Route}>
                      <Icon name="script" className="size-3.5" />
                      Open in Script Studio →
                    </Link>
                  </Button>
                </div>

                {/* Beats Timeline */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                    Narrative Beat Sequence
                  </h3>
                  <div className="grid gap-3">
                    {selectedStory.beats.map((beat, idx) => (
                      <div
                        key={idx}
                        className="rounded-2xl border border-border bg-surface-sunken p-4 transition hover:border-primary/40"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-primary">
                            {beat.act}
                          </span>
                          <span className="font-semibold text-foreground">
                            {beat.beat}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-foreground">
                          {beat.summary}
                        </p>
                        {beat.conflict && (
                          <div className="mt-2 text-[11px] text-muted-foreground">
                            <span className="font-semibold text-foreground/80">
                              Conflict:
                            </span>{" "}
                            {beat.conflict}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Character Profiles */}
                {selectedStory.characters &&
                  selectedStory.characters.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-border">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                        Character Archetypes
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {selectedStory.characters.map((char, idx) => (
                          <div
                            key={idx}
                            className="rounded-xl border border-border bg-card p-3.5"
                          >
                            <div className="text-xs font-bold text-foreground">
                              {char.name}
                            </div>
                            <div className="text-[10px] font-semibold text-primary">
                              {char.role}
                            </div>
                            <p className="mt-1.5 text-xs text-muted-foreground">
                              <span className="font-semibold text-foreground">
                                Desire:
                              </span>{" "}
                              {char.motivation}
                            </p>
                            {char.flaw && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                <span className="font-semibold text-foreground">
                                  Flaw:
                                </span>{" "}
                                {char.flaw}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            ) : (
              <div className="grid h-full place-items-center text-center">
                <div className="max-w-sm">
                  <Icon name="story" className="mx-auto size-10 text-primary" />
                  <h3 className="font-display mt-3 text-lg font-bold text-foreground">
                    Architect Your Story
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Use the Story Architect on the right to produce 3-act or
                    5-act beat sheets.
                  </p>
                </div>
              </div>
            )}
          </CreativeSurface>

          {/* AI Story Architect Generator */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-xs overflow-y-auto">
            <Eyebrow>Story Planning Model</Eyebrow>
            <h3 className="font-display mt-2 text-base font-bold text-foreground">
              Generate Story Beats
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Transform a premise into a structured act outline and character
              ensemble with a verified story-planning model.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-foreground">
                Story Model
              </label>
              <StudioModelSelect
                models={storyModels}
                value={selectedStoryModel}
                onChange={(value) => {
                  setSelectedStoryModel(value);
                  setStatusNotice(null);
                }}
                ariaLabel="Story planning model"
                className="mt-1 w-full"
              />
            </div>

            <form onSubmit={handleGenerateStory} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Story Title *
                </label>
                <input
                  type="text"
                  required
                  value={storyForm.title}
                  onChange={(e) =>
                    setStoryForm({ ...storyForm, title: e.target.value })
                  }
                  placeholder="e.g. Echoes of the Frankincense Trail"
                  className="mt-1 w-full rounded-xl border border-border bg-surface-sunken p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Genre
                </label>
                <input
                  type="text"
                  value={storyForm.genre}
                  onChange={(e) =>
                    setStoryForm({ ...storyForm, genre: e.target.value })
                  }
                  placeholder="e.g. Historical Mystery / Cinematic Drama"
                  className="mt-1 w-full rounded-xl border border-border bg-surface-sunken p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Narrative Structure
                </label>
                <select
                  value={storyForm.structureType}
                  onChange={(e) =>
                    setStoryForm({
                      ...storyForm,
                      structureType: e.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-surface-sunken p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="THREE_ACT">
                    Classic Three-Act (Setup, Confrontation, Resolution)
                  </option>
                  <option value="FIVE_ACT">
                    Dramatic Five-Act (Freytag&apos;s Pyramid)
                  </option>
                  <option value="HERO_JOURNEY">
                    The Hero&apos;s Journey (Monomyth)
                  </option>
                  <option value="SAVE_THE_CAT">
                    Save the Cat (15-beat structure)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Core Premise / Logline *
                </label>
                <textarea
                  required
                  rows={3}
                  value={storyForm.premise}
                  onChange={(e) =>
                    setStoryForm({ ...storyForm, premise: e.target.value })
                  }
                  placeholder="e.g. An archaeological archivist in Nizwa uncovers an encoded parchment that threatens a multi-generational water rights pact..."
                  className="mt-1 w-full rounded-xl border border-border bg-surface-sunken p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <Button
                type="submit"
                size="sm"
                className="w-full"
                disabled={
                  !storyForm.title.trim() ||
                  !storyForm.premise.trim() ||
                  isGeneratingStory ||
                  !canGenerate ||
                  !selectedStoryModel
                }
              >
                {isGeneratingStory
                  ? "Architecting Narrative..."
                  : "Generate Story Beat Sheet"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
