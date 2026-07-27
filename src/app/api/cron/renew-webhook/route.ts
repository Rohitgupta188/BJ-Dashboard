import { NextRequest, NextResponse } from "next/server";
import { randomUUID }                from "crypto";
import { getDriveClient }            from "@/lib/drive/client";
import { connectToDatabase }         from "@/lib/db";
import DriveChannel                  from "@/models/DriveChannel";

export const dynamic    = "force-dynamic";
export const maxDuration = 30;

const WEBHOOK_URL =
  process.env.DRIVE_WEBHOOK_URL ?? "";
const WEBHOOK_SECRET =
  process.env.GOOGLE_WEBHOOK_SECRET ?? process.env.DRIVE_WEBHOOK_CHANNEL_TOKEN ?? "";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      console.warn("[renew-webhook] Rejected: invalid CRON_SECRET");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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

  const existing = await DriveChannel.findById("main");
  if (!existing) {
    return NextResponse.json(
      { error: "No registered channel. Run: npm run register:webhook" },
      { status: 404 }
    );
  }

  const expiresIn = existing.expiresAt.getTime() - Date.now();
  const daysLeft  = Math.floor(expiresIn / (24 * 60 * 60 * 1000));

  if (expiresIn > THREE_DAYS_MS) {
    console.log(`[renew-webhook] Channel healthy — ${daysLeft} day(s) until expiry. Skipping.`);
    return NextResponse.json({
      status:  "ok",
      message: `Channel healthy — ${daysLeft} day(s) until expiry. Renewal not needed.`,
      daysLeft,
      expiresAt: existing.expiresAt,
    });
  }

  console.log(`[renew-webhook] Renewing channel (${daysLeft} day(s) until expiry)…`);

  try {
    const newChannelId = randomUUID();

    const watchRes = await drive.changes.watch({
      pageToken: existing.pageToken,
      requestBody: {
        id:         newChannelId,
        type:       "web_hook",
        address:    WEBHOOK_URL,
        token:      WEBHOOK_SECRET,
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
        channelId:  newId,
        resourceId: newResourceId,
        expiresAt:  newExpiresAt,
        renewedAt:  new Date(),
      },
      { upsert: true }
    );

    console.log(
      `[renew-webhook] ✅ New channel saved — expires ${newExpiresAt.toISOString()}`
    );

    try {
      await drive.channels.stop({
        requestBody: {
          id:         existing.channelId,
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
      status:    "renewed",
      channelId: newId,
      expiresAt: newExpiresAt,
      daysLeft:  Math.floor((newExpiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[renew-webhook] ❌ Renewal failed:", message);
    return NextResponse.json({ error: "Renewal failed", message }, { status: 500 });
  }
}
