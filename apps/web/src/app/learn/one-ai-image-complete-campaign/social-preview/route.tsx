import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const dynamic = "force-static";

// Raster social preview: crawlers do not consistently render SVG Open Graph media.
// No customer assets or external image fetches are involved.
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#101b31",
          color: "#f6f3ed",
          fontFamily: "Arial",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", padding: 70, width: 820, zIndex: 2 }}>
          <div style={{ fontSize: 22, letterSpacing: 4, color: "#dbc3a6", fontWeight: 700 }}>
            AIWA CREATORS · LEARN 03
          </div>
          <div style={{ marginTop: 46, display: "flex", flexDirection: "column", fontWeight: 800, fontSize: 65, lineHeight: 1.1 }}>
            <div>ONE IMAGE.</div>
            <div style={{ marginTop: 10 }}>A WHOLE</div>
            <div>CAMPAIGN.</div>
          </div>
          <div style={{ marginTop: 42, fontSize: 25, color: "#afc0dd" }}>
            Editing · Upscaling · Adaptation · Delivery
          </div>
        </div>
        <div style={{ position: "absolute", display: "flex", width: 590, height: 590, borderRadius: 320, background: "#203e78", top: 80, left: 760 }} />
        <div style={{ position: "absolute", display: "flex", width: 320, height: 318, borderRadius: 46, background: "#3967d7", top: 228, left: 849 }} />
        <div style={{ position: "absolute", display: "flex", width: 143, height: 162, borderRadius: 100, border: "31px solid #3967d7", top: 286, left: 1082 }} />
        <div style={{ position: "absolute", display: "flex", width: 312, height: 34, borderRadius: 80, background: "#284d9c", top: 211, left: 852 }} />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    },
  );
}
