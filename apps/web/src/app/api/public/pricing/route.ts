import { NextResponse } from "next/server";
import { getPublicPricingCatalogue } from "@/lib/public-pricing";

export async function GET() {
  try {
    const catalogue = await getPublicPricingCatalogue();
    return NextResponse.json(catalogue, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch {
    return NextResponse.json(
      { error: "Pricing is temporarily unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
