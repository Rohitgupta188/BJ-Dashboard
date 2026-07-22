import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/image-proxy?url=<encoded-image-url>
 *
 * Server-side image proxy used by the PDF generator to fetch external images
 * without being blocked by browser CORS policies.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  // Validate that the URL is a proper http/https URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error("Invalid protocol");
    }
  } catch {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  try {
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        // Mimic a regular browser request
        "User-Agent": "Mozilla/5.0",
        Accept: "image/*,*/*",
      },
    });

    if (!response.ok) {
      return new NextResponse(`Upstream error: ${response.status}`, {
        status: response.status,
      });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (err) {
    console.error("[image-proxy] Failed to fetch image:", err);
    return new NextResponse("Failed to fetch image", { status: 500 });
  }
}
