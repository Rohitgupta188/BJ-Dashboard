/**
 * POST /api/catalog/import-images
 *
 * Accepts a multipart/form-data request with:
 *   images  — one or more image files (jpg, jpeg, png, webp, gif)
 *
 * For each image:
 *   1. Upload to Backblaze B2
 *   2. Match by filename → Catalog.find({ imageName })
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
import os from "os";
import fs from "fs";
import Catalog from "@/models/Catalog";
import { connectToDatabase } from "@/lib/db";
import {
  uploadToBackblaze,
  objectExistsInBucket,
  DEFAULT_UPLOAD_FOLDER,
} from "@/lib/backblaze";

const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const IMAGEKIT_URL_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT;

if (!IMAGEKIT_URL_ENDPOINT) {
  throw new Error("Missing IMAGEKIT_URL_ENDPOINT in .env.local");
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImageResult {
  filename:  string;
  status:    "uploaded" | "backfilled" | "unmatched" | "failed";
  matched?:  number; // how many catalog docs were updated
  error?:    string;
}

import { withAuth, type AuthenticatedRequest } from "@/lib/auth";

// ─── Route ────────────────────────────────────────────────────────────────────

export const POST = withAuth(async (req: NextRequest, ctx: AuthenticatedRequest) => {
  try {
    await connectToDatabase();

    const formData = await req.formData();
    const files    = formData.getAll("images") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No images provided." }, { status: 400 });
    }

    // Validate extensions
    const invalidFiles = files.filter((f) => {
      const ext = path.extname(f.name).toLowerCase();
      return !ALLOWED_EXTENSIONS.includes(ext);
    });

    if (invalidFiles.length > 0) {
      return NextResponse.json(
        {
          error: `Unsupported file type(s): ${invalidFiles.map((f) => f.name).join(", ")}. ` +
                 `Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const results: ImageResult[] = [];
    let totalUploaded   = 0;
    let totalBackfilled = 0;
    let totalUnmatched  = 0;

    // Process each file
    for (const file of files) {
      const filename  = file.name;
      const ext       = path.extname(filename).toLowerCase();
      const objectKey = `${DEFAULT_UPLOAD_FOLDER}/${filename}`;
      const imageUrl  = `${IMAGEKIT_URL_ENDPOINT!.replace(/\/$/, "")}/${objectKey}`;

      // Write to temp file — Backblaze SDK needs a file path
      const tmpPath = path.join(os.tmpdir(), `bj-upload-${Date.now()}-${filename}`);

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        fs.writeFileSync(tmpPath, buffer);

        // ── Upload to Backblaze ──────────────────────────────────────────────
        const alreadyInBucket = await objectExistsInBucket(objectKey);
        if (!alreadyInBucket) {
          await uploadToBackblaze(tmpPath, filename, DEFAULT_UPLOAD_FOLDER);
        }

        // ── Match by imageName in MongoDB ────────────────────────────────────
        const nameWithoutExt = path.basename(filename, ext);

        const matchedDocs = await Catalog.find({
          $or: [
            { imageName: { $regex: `^${filename}$`,        $options: "i" } },
            { imageName: { $regex: `^${nameWithoutExt}$`,  $options: "i" } },
          ],
          $and: [{ $or: [{ imageUrl: { $exists: false } }, { imageUrl: null }] }],
        }).select("_id designNumber");

        if (matchedDocs.length === 0) {
          // Check if already done (imageUrl set)
          const alreadyDone = await Catalog.exists({
            $or: [
              { imageName: { $regex: `^${filename}$`,       $options: "i" } },
              { imageName: { $regex: `^${nameWithoutExt}$`, $options: "i" } },
            ],
            imageUrl: { $exists: true, $ne: null },
          });

          results.push({
            filename,
            status: alreadyDone ? "backfilled" : "unmatched",
            matched: 0,
          });

          if (!alreadyDone) totalUnmatched++;
          else totalBackfilled++;
          continue;
        }

        // ── Write imageUrl to matched docs ───────────────────────────────────
        const matchedIds      = matchedDocs.map((d) => d._id);
        const designNumbers   = [...new Set(matchedDocs.map((d) => d.designNumber))];

        await Catalog.updateMany(
          { _id: { $in: matchedIds } },
          {
            $set: {
              imageUrl:        imageUrl,
              storagePath:     objectKey,
              storageProvider: "backblaze",
            },
          }
        );

        // ── Backfill siblings with same designNumber ─────────────────────────
        const backfillResult = await Catalog.updateMany(
          {
            designNumber: { $in: designNumbers },
            $or: [{ imageUrl: { $exists: false } }, { imageUrl: null }],
          },
          {
            $set: {
              imageUrl:        imageUrl,
              storagePath:     objectKey,
              storageProvider: "backblaze",
            },
          }
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
      } finally {
        // Always clean up the temp file
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
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

export const maxDuration = 60; // seconds — gives enough time for large batches
