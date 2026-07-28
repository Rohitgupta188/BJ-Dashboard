/**
 * scripts/register-webhook.ts
 *
 * Registers (or re-registers) a Google Drive push-notification channel.
 *
 * Per the latest Google Drive API v3 documentation (2025/2026):
 *   • changes.watch → max TTL 7 days (604,800 s) for the changes resource
 *   • channels.stop must be called on the old channel to avoid zombie listeners
 *   • The webhook URL MUST be HTTPS, domain-verified in Google Search Console,
 *     and reachable at registration time (Google sends a sync notification)
 *
 * IMPORTANT: Run AFTER deploying to Vercel. Google validates the webhook URL
 * during registration — the URL must respond with 200/201/202/204 or 102.
 *
 * Usage:
 *   npm run register:webhook              # safe — skips if channel is still active
 *   npm run register:webhook -- --force   # stops old channel and re-registers
 *
 * Required in .env.local:
 *   MONGODB_URI
 *   GOOGLE_DRIVE_FOLDER_ID     — AAA DESIGNS folder ID (used for reference)
 *   DRIVE_WEBHOOK_URL          — https://dashboard.brahammandjewels.com/api/drive/webhook
 *   GOOGLE_WEBHOOK_SECRET      — secret token (or DRIVE_WEBHOOK_CHANNEL_TOKEN)
 *   GOOGLE_CLIENT_EMAIL        — service account email  ┐ OR use
 *   GOOGLE_PRIVATE_KEY         — service account key    ┘ GOOGLE_SERVICE_ACCOUNT_KEY (full JSON)
 *
 * Reference: https://developers.google.com/workspace/drive/api/guides/push
 */

import { randomUUID } from "crypto";
import mongoose       from "mongoose";
import { getDriveClient } from "../src/lib/drive/client";
import DriveChannel   from "../src/models/DriveChannel";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum TTL for changes.watch — 7 days per Google documentation */
const MAX_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

/** Renew threshold — skip auto if channel still has more than this many days left */
const RENEW_THRESHOLD_DAYS = 1;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateEnv() {
  const hasCredentials =
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
    (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);

  const checks: Record<string, boolean> = {
    "MONGODB_URI":                          !!process.env.MONGODB_URI,
    "DRIVE_WEBHOOK_URL":                    !!process.env.DRIVE_WEBHOOK_URL,
    "GOOGLE_DRIVE_FOLDER_ID":               !!process.env.GOOGLE_DRIVE_FOLDER_ID,
    "GOOGLE_WEBHOOK_SECRET (or DRIVE_WEBHOOK_CHANNEL_TOKEN)":
      !!(process.env.GOOGLE_WEBHOOK_SECRET ?? process.env.DRIVE_WEBHOOK_CHANNEL_TOKEN),
    "Google credentials (service account)": !!hasCredentials,
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

/**
 * Verifies the webhook URL is reachable before asking Google to register it.
 * Google will POST a "sync" notification during registration — if the URL
 * returns a non-2xx response the watch call fails immediately.
 */
async function verifyWebhookReachable(webhookUrl: string): Promise<void> {
  console.log(`  Checking URL : ${webhookUrl}`);
  try {
    const res = await fetch(webhookUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(10_000),
    });
    // 405 Method Not Allowed is acceptable — endpoint exists but only accepts POST
    if (!res.ok && res.status !== 405) {
      console.warn(
        `  ⚠️  Webhook returned HTTP ${res.status} — registration may fail.\n` +
        `     Ensure /api/drive/webhook responds with 2xx for POST requests.`
      );
    } else {
      console.log(`  URL check    : HTTP ${res.status} ✓`);
    }
  } catch (err: any) {
    console.error(`\n❌  Cannot reach webhook URL: ${err?.message}`);
    console.error(
      "   Deploy your Next.js app first, then run this script.\n" +
      "   (Google Drive validates the URL during channel registration.)\n"
    );
    process.exit(1);
  }
}

/**
 * Calls channels.stop() on the old channel so Google stops sending duplicate
 * notifications. Errors are soft-logged — the channel may have already expired.
 *
 * Per Drive API v3 docs: POST https://www.googleapis.com/drive/v3/channels/stop
 * with body { id, resourceId }
 */
async function stopOldChannel(
  drive: ReturnType<typeof getDriveClient>,
  channelId: string,
  resourceId: string
): Promise<void> {
  try {
    await drive.channels.stop({
      requestBody: { id: channelId, resourceId },
    });
    console.log(`  Old channel  : stopped (${channelId.slice(0, 8)}…) ✓`);
  } catch (err: any) {
    // 404 = channel already expired — that is perfectly fine
    const code = err?.code ?? err?.status;
    if (code === 404) {
      console.log(`  Old channel  : already expired, nothing to stop.`);
    } else {
      console.warn(`  ⚠️  channels.stop warning (${code}): ${err?.message}`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const forceFlag = process.argv.includes("--force");

  validateEnv();

  const webhookUrl    = process.env.DRIVE_WEBHOOK_URL!;
  const webhookSecret =
    (process.env.GOOGLE_WEBHOOK_SECRET ?? process.env.DRIVE_WEBHOOK_CHANNEL_TOKEN)!;

  console.log("\n──────────────────────────────────────────────────────");
  console.log("  Google Drive Webhook — Register Channel");
  console.log("  (Drive API v3 · changes.watch · googleapis v173+)");
  console.log("──────────────────────────────────────────────────────");
  console.log(`  Webhook URL  : ${webhookUrl}`);
  console.log(`  Folder ID    : ${process.env.GOOGLE_DRIVE_FOLDER_ID}`);
  if (forceFlag) console.log("  Mode         : --force (will stop old channel)");

  // ── Verify webhook endpoint is reachable before hitting Google API ─────────
  await verifyWebhookReachable(webhookUrl);

  // ── Connect to MongoDB ─────────────────────────────────────────────────────
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log("  MongoDB      : connected ✓\n");

  const drive = getDriveClient();

  // ── Check for existing active channel ─────────────────────────────────────
  const existing = await DriveChannel.findById("main");
  if (existing) {
    const daysLeft = Math.floor(
      (existing.expiresAt.getTime() - Date.now()) / 86_400_000
    );

    if (daysLeft > RENEW_THRESHOLD_DAYS && !forceFlag) {
      console.log(`⚠️  Active channel found — ${daysLeft} day(s) until expiry.`);
      console.log(`   Channel ID  : ${existing.channelId}`);
      console.log("   The cron job at /api/cron/renew-webhook will auto-renew it.");
      console.log("   To force re-registration run:");
      console.log("     npm run register:webhook -- --force\n");
      await mongoose.disconnect();
      process.exit(0);
    }

    const reason = forceFlag ? "--force flag" : "channel expiring soon";
    console.log(`⚠️  Re-registering channel (${reason})…`);

    // Stop the old channel — prevents Google from sending phantom notifications
    // to the now-obsolete channel after we create the replacement.
    await stopOldChannel(drive, existing.channelId, existing.resourceId);
  }

  // ── Fetch a fresh start page token ────────────────────────────────────────
  // This tells Google: "watch changes starting from RIGHT NOW — no catch-up replay"
  const tokenRes = await drive.changes.getStartPageToken({});
  const startPageToken = tokenRes.data.startPageToken;
  if (!startPageToken) {
    console.error("❌  Drive API did not return a startPageToken.");
    console.error("    → Is the service account shared on the Drive folder?");
    console.error("    → Does the service account have Drive API enabled?");
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`\n  Page token   : ${startPageToken}`);

  // ── Register the watch channel ─────────────────────────────────────────────
  // Per Drive API v3 docs:
  //   • type must be "web_hook"
  //   • address must be HTTPS with a valid cert, domain-verified in Search Console
  //   • expiration is an epoch-milliseconds string; max 7 days for changes resource
  //   • token is echoed back as X-Goog-Channel-Token on every notification
  const channelId    = randomUUID();
  const expirationMs = Date.now() + MAX_TTL_MS;

  let watchRes;
  try {
    watchRes = await drive.changes.watch({
      pageToken: startPageToken,
      requestBody: {
        id:         channelId,
        type:       "web_hook",
        address:    webhookUrl,
        token:      webhookSecret,        // echoed in X-Goog-Channel-Token header
        expiration: String(expirationMs), // epoch ms string — max 7 days granted
      },
    });
  } catch (err: any) {
    console.error("\n❌  drive.changes.watch failed:");
    console.error(`   ${err?.message ?? err}`);
    if (
      err?.message?.toLowerCase().includes("domain") ||
      err?.message?.toLowerCase().includes("push")
    ) {
      console.error("\n   ⚠️  Domain verification may be required:");
      console.error("   1. Go to https://search.google.com/search-console");
      console.error("   2. Add & verify: dashboard.brahammandjewels.com");
      console.error("   3. In Google Cloud Console → APIs & Services → Domain Verification");
      console.error("      add dashboard.brahammandjewels.com as an allowed domain.");
    }
    await mongoose.disconnect();
    process.exit(1);
  }

  const grantedExpiration = Number(watchRes.data.expiration);
  const expiresAt         = new Date(grantedExpiration);
  const daysUntilExpiry   = Math.floor(
    (expiresAt.getTime() - Date.now()) / 86_400_000
  );
  const hoursGranted = Math.round((grantedExpiration - Date.now()) / 3_600_000);

  // ── Persist channel state to MongoDB ──────────────────────────────────────
  await DriveChannel.findByIdAndUpdate(
    "main",
    {
      channelId:  watchRes.data.id!,
      resourceId: watchRes.data.resourceId!,
      pageToken:  startPageToken,
      expiresAt,
      renewedAt:  new Date(),
    },
    { upsert: true }
  );

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n✅  Channel registered and saved to MongoDB!\n");
  console.log(`   Channel ID  : ${watchRes.data.id}`);
  console.log(`   Resource ID : ${watchRes.data.resourceId}`);
  console.log(`   Expires     : ${expiresAt.toLocaleString()} (~${daysUntilExpiry} day(s))`);
  console.log(`   TTL granted : ${hoursGranted} hour(s)`);
  console.log("\n──────────────────────────────────────────────────────");
  console.log("  Next Steps:");
  console.log("  1. Upload a test image to your AAA DESIGNS Drive folder");
  console.log("  2. Watch Vercel logs for [drive/webhook] entries");
  console.log(
    `  3. Check status : ${webhookUrl.replace("/api/drive/webhook", "/api/drive/webhook-status")}`
  );
  console.log("  4. Cron at /api/cron/renew-webhook renews automatically");
  console.log("──────────────────────────────────────────────────────\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("\n❌  Registration failed:", err?.message ?? err);
  process.exit(1);
});
