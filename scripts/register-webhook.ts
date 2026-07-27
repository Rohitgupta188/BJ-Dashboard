/**
 * scripts/register-webhook.ts
 *
 * One-time script to register the Google Drive push notification channel.
 *
 * IMPORTANT: Run AFTER deploying to Vercel. Google validates the webhook URL
 * during registration — the URL must exist and respond with 200.
 *
 * Usage:
 *   npm run register:webhook
 *
 * Required in .env.local:
 *   MONGODB_URI
 *   GOOGLE_DRIVE_FOLDER_ID     — AAA DESIGNS folder ID
 *   DRIVE_WEBHOOK_URL          — https://yourdomain.vercel.app/api/drive/webhook
 *   GOOGLE_WEBHOOK_SECRET      — secret token (or DRIVE_WEBHOOK_CHANNEL_TOKEN)
 *   GOOGLE_CLIENT_EMAIL        — service account email
 *   GOOGLE_PRIVATE_KEY         — service account private key
 *                              — OR: GOOGLE_SERVICE_ACCOUNT_KEY (full JSON)
 */

import { randomUUID } from "crypto";
import mongoose       from "mongoose";
import { getDriveClient } from "../src/lib/drive/client";

// ─── Inline DriveChannel model ────────────────────────────────────────────────
// Defined here to avoid Next.js module resolution quirks when running scripts

const DriveChannelSchema = new mongoose.Schema(
  {
    _id:        { type: String },
    channelId:  { type: String, required: true },
    resourceId: { type: String, required: true },
    pageToken:  { type: String, required: true },
    expiresAt:  { type: Date,   required: true },
    renewedAt:  { type: Date },
  },
  { collection: "drive_channels" }
);

const DriveChannel =
  (mongoose.models.DriveChannel as mongoose.Model<any>) ||
  mongoose.model("DriveChannel", DriveChannelSchema);

// ─── Validation ───────────────────────────────────────────────────────────────

function validateEnv() {
  const hasCredentials =
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
    (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);

  const checks: Record<string, boolean> = {
    "MONGODB_URI":                !!process.env.MONGODB_URI,
    "DRIVE_WEBHOOK_URL":          !!process.env.DRIVE_WEBHOOK_URL,
    "GOOGLE_DRIVE_FOLDER_ID":     !!process.env.GOOGLE_DRIVE_FOLDER_ID,
    "GOOGLE_WEBHOOK_SECRET (or DRIVE_WEBHOOK_CHANNEL_TOKEN)":
      !!(process.env.GOOGLE_WEBHOOK_SECRET ?? process.env.DRIVE_WEBHOOK_CHANNEL_TOKEN),
    "Google credentials":         !!hasCredentials,
  };

  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([k]) => k);

  if (missing.length > 0) {
    console.error("\n❌  Missing required configuration:");
    missing.forEach((k) => console.error(`    • ${k}`));
    console.error("\nAdd them to your .env.local and try again.\n");
    process.exit(1);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  validateEnv();

  const webhookUrl    = process.env.DRIVE_WEBHOOK_URL!;
  const webhookSecret =
    (process.env.GOOGLE_WEBHOOK_SECRET ?? process.env.DRIVE_WEBHOOK_CHANNEL_TOKEN)!;

  console.log("\n──────────────────────────────────────────────────────");
  console.log("  Google Drive Webhook — Register Channel");
  console.log("──────────────────────────────────────────────────────");
  console.log(`  Webhook URL : ${webhookUrl}`);
  console.log(`  Folder ID   : ${process.env.GOOGLE_DRIVE_FOLDER_ID}`);

  // ── Connect to MongoDB ────────────────────────────────────────────────────
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log("  MongoDB     : connected ✓\n");

  // ── Check for existing active channel ─────────────────────────────────────
  const existing = await DriveChannel.findById("main");
  if (existing) {
    const daysLeft = Math.floor(
      (existing.expiresAt.getTime() - Date.now()) / 86_400_000
    );
    if (daysLeft > 0) {
      console.log(`⚠️  An active channel already exists (${daysLeft} day(s) until expiry).`);
      console.log(`   Channel ID : ${existing.channelId}`);
      console.log("   The cron job at /api/cron/renew-webhook auto-renews it.");
      console.log("   No action needed — exiting.\n");
      await mongoose.disconnect();
      process.exit(0);
    }
    console.log("⚠️  Previous channel has expired — registering a fresh one...\n");
  }

  const drive = getDriveClient();

  // ── Fetch start page token ────────────────────────────────────────────────
  // This tells Google: "watch changes starting from RIGHT NOW"
  const tokenRes = await drive.changes.getStartPageToken({});
  const startPageToken = tokenRes.data.startPageToken;
  if (!startPageToken) {
    console.error("❌  Drive API did not return a startPageToken.");
    console.error("    → Is the service account shared on the Drive folder?");
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`  Page token  : ${startPageToken}`);

  // ── Register the watch channel ────────────────────────────────────────────
  const channelId = randomUUID();
  const watchRes  = await drive.changes.watch({
    pageToken: startPageToken,
    requestBody: {
      id:         channelId,
      type:       "web_hook",
      address:    webhookUrl,
      // Sent back in x-goog-channel-token on every notification
      token:      webhookSecret,
      // Request 7-day TTL (Google may grant less)
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const expiresAt      = new Date(Number(watchRes.data.expiration));
  const daysUntilExpiry = Math.floor(
    (expiresAt.getTime() - Date.now()) / 86_400_000
  );

  // ── Save channel state to MongoDB ─────────────────────────────────────────
  await DriveChannel.findByIdAndUpdate(
    "main",
    {
      channelId:  watchRes.data.id!,
      resourceId: watchRes.data.resourceId!,
      pageToken:  startPageToken,
      expiresAt,
    },
    { upsert: true }
  );

  console.log("\n✅  Channel registered and saved to MongoDB!\n");
  console.log(`   Channel ID  : ${watchRes.data.id}`);
  console.log(`   Resource ID : ${watchRes.data.resourceId}`);
  console.log(`   Expires     : ${expiresAt.toLocaleString()} (~${daysUntilExpiry} day(s))\n`);
  console.log("──────────────────────────────────────────────────────");
  console.log("  Next Steps:");
  console.log("  1. Upload a test image to your AAA DESIGNS Drive folder");
  console.log("  2. Watch Vercel logs for [drive/webhook] entries");
  console.log(
    `  3. Check status: ${webhookUrl.replace("/api/drive/webhook", "/api/drive/webhook-status")}`
  );
  console.log("  4. Cron renews automatically — no manual action needed");
  console.log("──────────────────────────────────────────────────────\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("\n❌  Registration failed:", err?.message ?? err);
  process.exit(1);
});
