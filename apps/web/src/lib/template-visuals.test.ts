import { describe, expect, it } from "vitest";
import { getTemplateVisual, templateActivationHref, templateVisuals } from "./template-visuals";
describe("Templates 2.0 visual catalog",()=>{
 it("gives all 25 built-in recipes a unique local image and purpose-specific SVG icon",()=>{
  const visuals=Object.entries(templateVisuals);
  expect(visuals).toHaveLength(25);
  expect(new Set(visuals.map(([,v])=>v.cover)).size).toBe(25);
  expect(new Set(visuals.map(([,v])=>v.icon)).size).toBe(25);
  for(const [slug,entry] of visuals){
   expect(entry.cover).toBe(`/template-covers/${slug}.svg`);
   expect(entry.alt.length).toBeGreaterThan(12);
   expect(entry.alt).not.toContain("<");
  }
 });
 it("falls back to built-in artwork when an admin-created recipe has no cover",()=>{
  expect(getTemplateVisual("a-new-video","VIDEO").cover).toBe(templateVisuals["product-promo-video"].cover);
  expect(getTemplateVisual("a-new-audio","VOICE").cover).toBe(templateVisuals["podcast-intro"].cover);
 });
 it("sends a selected template directly to the existing workspace, not a composer",()=>{
  expect(templateActivationHref("test-studio","youtube-thumbnail")).toBe("/app/test-studio?template=youtube-thumbnail#create");
  expect(templateActivationHref("team/other","name & more")).toBe("/app/team%2Fother?template=name%20%26%20more#create");
 });
});
