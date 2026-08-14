/**
 * POST /api/catalog/import-images
 *
 * Accepts a multipart/form-data request with:
 *   images  — one or more image files (jpg, jpeg, png, webp, gif)
 *
 * For each image:
 *   1. Upload to Backblaze B2 (buffer → B2 directly, no temp disk write)
 *   2. Match by imageName → Catalog.find()
 *   3. Write imageUrl, storagePath, storageProvider to matched docs
 *   4. Backfill siblings with same designNumber
 *
 * Returns { uploaded, backfilled, unmatched[] }
 *
 * Called in batches of 10 from the client — no single request
 * carries more than 10 files to stay within serverless limits.
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import Catalog, { CATALOG_COLLATION } from "@/models/Catalog";
import { connectToDatabase } from "@/lib/db";
import {
  uploadBufferToBackblaze,
  getContentType,
  objectExistsInBucket,
  DEFAULT_UPLOAD_FOLDER,
} from "@/lib/backblaze";
import { withAuth, type AuthenticatedRequest } from "@/lib/auth";

const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const IMAGEKIT_URL_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT;

if (!IMAGEKIT_URL_ENDPOINT) {
  throw new Error("Missing IMAGEKIT_URL_ENDPOINT in .env.local");
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImageResult {
  filename: string;
  status:   "uploaded" | "backfilled" | "unmatched" | "failed";
  matched?: number;
  error?:   string;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export const POST = withAuth(async (req: NextRequest, _ctx: AuthenticatedRequest) => {
  try {
    await connectToDatabase();

    const formData = await req.formData();
    const files    = formData.getAll("images") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No images provided." }, { status: 400 });
    }

    // Validate extensions up front
    const invalidFiles = files.filter((f) => {
      const ext = path.extname(f.name).toLowerCase();
      return !ALLOWED_EXTENSIONS.includes(ext);
    });
    if (invalidFiles.length > 0) {
      return NextResponse.json(
        {
          error:
            `Unsupported file type(s): ${invalidFiles.map((f) => f.name).join(", ")}. ` +
            `Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const results: ImageResult[] = [];
    let totalUploaded   = 0;
    let totalBackfilled = 0;
    let totalUnmatched  = 0;

    for (const file of files) {
      const filename       = file.name;
      const ext            = path.extname(filename).toLowerCase();
      const nameWithoutExt = path.basename(filename, ext);
      const objectKey      = `${DEFAULT_UPLOAD_FOLDER}/${filename}`;
      const imageUrl       = `${IMAGEKIT_URL_ENDPOINT!.replace(/\/$/, "")}/${objectKey}`;

      try {
        // ── Read buffer once, upload directly — no temp file needed ───────────
        const buffer      = Buffer.from(await file.arrayBuffer());
        const contentType = getContentType(filename);

        const alreadyInBucket = await objectExistsInBucket(objectKey);
        if (!alreadyInBucket) {
          await uploadBufferToBackblaze(buffer, filename, contentType, DEFAULT_UPLOAD_FOLDER);
        }

        // ── Match by imageName using collation index (case-insensitive) ───────
        const matchedDocs = await Catalog.find({
          $or: [
            { imageName: filename       },
            { imageName: nameWithoutExt },
          ],
          imageUrl: { $in: [null, ""] }, // $in:[null] also matches missing fields
        })
          .collation(CATALOG_COLLATION)
          .select("_id designNumber");

        if (matchedDocs.length === 0) {
          // Already done if imageUrl is set
          const alreadyDone = await Catalog.exists({
            $or: [
              { imageName: filename       },
              { imageName: nameWithoutExt },
            ],
            imageUrl: { $exists: true, $nin: [null, ""] },
          }).collation(CATALOG_COLLATION);

          results.push({ filename, status: alreadyDone ? "backfilled" : "unmatched", matched: 0 });
          if (!alreadyDone) totalUnmatched++;
          else totalBackfilled++;
          continue;
        }

        // ── Write imageUrl to matched docs ────────────────────────────────────
        const matchedIds    = matchedDocs.map((d) => d._id);
        const designNumbers = [...new Set(matchedDocs.map((d) => d.designNumber))];

        await Catalog.updateMany(
          { _id: { $in: matchedIds } },
          { $set: { imageUrl, storagePath: objectKey, storageProvider: "backblaze" } }
        );

        // ── Backfill siblings with same designNumber ──────────────────────────
        const backfillResult = await Catalog.updateMany(
          {
            designNumber: { $in: designNumbers },
            $or: [{ imageUrl: { $exists: false } }, { imageUrl: null }, { imageUrl: "" }],
          },
          { $set: { imageUrl, storagePath: objectKey, storageProvider: "backblaze" } }
        );

        totalUploaded++;
        totalBackfilled += backfillResult.modifiedCount;

        results.push({
          filename,
          status:  alreadyInBucket ? "backfilled" : "uploaded",
          matched: matchedDocs.length + backfillResult.modifiedCount,
        });
      } catch (err) {
        results.push({
          filename,
          status: "failed",
          error:  err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      uploaded:   totalUploaded,
      backfilled: totalBackfilled,
      unmatched:  totalUnmatched,
      results,
    });
  } catch (err) {
    console.error("[POST /api/catalog/import-images]", err);
    return NextResponse.json({ error: "Server error during image upload." }, { status: 500 });
  }
}, { requireRole: "admin" });

export const maxDuration = 60;
