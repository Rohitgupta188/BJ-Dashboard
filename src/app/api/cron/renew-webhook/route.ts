import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDriveClient } from "@/lib/drive/client";
import { connectToDatabase } from "@/lib/db";
import DriveChannel from "@/models/DriveChannel";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const WEBHOOK_URL =
  process.env.DRIVE_WEBHOOK_URL ?? "";
const WEBHOOK_SECRET =
  process.env.GOOGLE_WEBHOOK_SECRET ?? process.env.DRIVE_WEBHOOK_CHANNEL_TOKEN ?? "";

// Renew when channel has ≤5 days left.
// With a daily cron this gives 5 retry windows before expiry — vs the previous
// 1.5-day margin when the cron ran every 2 days with a 3-day threshold.
const RENEW_THRESHOLD_MS = 5 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS      = 7 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  // CRON_SECRET MUST be set. If missing, reject rather than skipping auth.
  if (!cronSecret) {
    console.error("[renew-webhook] CRON_SECRET env var is not set — rejecting request");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    console.warn("[renew-webhook] Rejected: invalid CRON_SECRET");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!WEBHOOK_URL || !WEBHOOK_SECRET) {
    console.error("[renew-webhook] Missing DRIVE_WEBHOOK_URL or GOOGLE_WEBHOOK_SECRET");
    return NextResponse.json(
      { error: "DRIVE_WEBHOOK_URL or GOOGLE_WEBHOOK_SECRET is not set" },
      { status: 500 }
    );
  }

  await connectToDatabase();
  const drive = getDriveClient();

  const anyChannel = await DriveChannel.findById("main");
  if (!anyChannel) {
    return NextResponse.json(
      { error: "No registered channel. Run: npm run register:webhook" },
      { status: 404 }
    );
  }

  // The 6-minute stale-lock timeout acts as crash recovery if the Vercel
  // function dies before the finally block executes.
  // Note: This relies on the assumption that an execution will never hang
  // for >6 minutes. Since we use `export const maxDuration = 300;`, Vercel
  // strictly guarantees the process will be killed well before 6 minutes.
  const lockCutoff = new Date(Date.now() - 6 * 60 * 1000);
  const existing = await DriveChannel.findOneAndUpdate(
    {
      _id: "main",
      $or: [
        { renewLockedAt: { $exists: false } },
        { renewLockedAt: null },
        { renewLockedAt: { $lt: lockCutoff } },
      ],
    },
    { $set: { renewLockedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!existing) {
    console.log("[renew-webhook] Renewal already in progress by another invocation. Skipping.");
    return NextResponse.json({ status: "skipped", message: "Renewal already in progress." });
  }

  try {
    const expiresIn = existing.expiresAt.getTime() - Date.now();
    const daysLeft = Math.floor(expiresIn / (24 * 60 * 60 * 1000));

    if (expiresIn > RENEW_THRESHOLD_MS) {
      console.log(`[renew-webhook] Channel healthy — ${daysLeft} day(s) until expiry. Skipping.`);
      return NextResponse.json({
        status: "ok",
        message: `Channel healthy — ${daysLeft} day(s) until expiry. Renewal not needed.`,
        daysLeft,
        expiresAt: existing.expiresAt,
      });
    }

    console.log(`[renew-webhook] Renewing channel (${daysLeft} day(s) until expiry)…`);

    const newChannelId = randomUUID();

    // Register new channel using existing.pageToken so there is zero gap:
    // the new channel continues exactly where the old one left off.
    // getStartPageToken() would give a "now" token, silently skipping any
    // Drive changes that occurred between the last processed event and renewal.
    const watchRes = await drive.changes.watch({
      pageToken: existing.pageToken,
      requestBody: {
        id: newChannelId,
        type: "web_hook",
        address: WEBHOOK_URL,
        token: WEBHOOK_SECRET,
        expiration: String(Date.now() + SEVEN_DAYS_MS),
      },
    });

    const { id: newId, resourceId: newResourceId, expiration } = watchRes.data;

    if (!newId || !newResourceId || !expiration) {
      throw new Error(
        `Drive API returned incomplete channel data: ` +
        `id=${newId}, resourceId=${newResourceId}, expiration=${expiration}`
      );
    }

    const newExpiresAt = new Date(Number(expiration));
    if (isNaN(newExpiresAt.getTime())) {
      throw new Error(`Drive API returned invalid expiration timestamp: ${expiration}`);
    }

    await DriveChannel.findByIdAndUpdate(
      "main",
      {
        channelId: newId,
        resourceId: newResourceId,
        expiresAt: newExpiresAt,
        renewedAt: new Date(),
      },
      { upsert: true }
    );

    console.log(
      `[renew-webhook] ✅ New channel saved — expires ${newExpiresAt.toISOString()}`
    );

    try {
      await drive.channels.stop({
        requestBody: {
          id: existing.channelId,
          resourceId: existing.resourceId,
        },
      });
      console.log("[renew-webhook] Old channel stopped ✓");
    } catch (stopErr) {
      console.warn(
        "[renew-webhook] Could not stop old channel (it will expire naturally):",
        stopErr instanceof Error ? stopErr.message : stopErr
      );
    }

    return NextResponse.json({
      status: "renewed",
      channelId: newId,
      expiresAt: newExpiresAt,
      daysLeft: Math.floor((newExpiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    });

  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[renew-webhook] ❌ Renewal failed:", err);

    const alertUrl = process.env.ALERT_WEBHOOK_URL;
    if (alertUrl) {
      const expiresIn = existing.expiresAt.getTime() - Date.now();
      const daysLeft = Math.floor(expiresIn / (24 * 60 * 60 * 1000));
      const alertBody = JSON.stringify({
        text: `🚨 *Drive webhook renewal FAILED* — channel may expire in ${daysLeft} day(s).\nError: ${message}\nManually run \`npm run register:webhook\` or check Vercel env vars.`,
      });
      try {
        await fetch(alertUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: alertBody,
        });
      } catch (alertErr) {
        console.error("[renew-webhook] Failed to send alert:", alertErr);
      }
    }

    return NextResponse.json({ error: "Renewal failed", message }, { status: 500 });
  } finally {
    // Always release the mutex lock
    await DriveChannel.findByIdAndUpdate("main", {
      $unset: { renewLockedAt: "" }
    }).catch(e => console.error("[renew-webhook] Failed to release lock", e));
  }
}
