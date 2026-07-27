
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase }         from "@/lib/db";
import DriveChannel                  from "@/models/DriveChannel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  await connectToDatabase();
  const channel = await DriveChannel.findById("main").lean();

  if (!channel) {
    return NextResponse.json(
      {
        status:  "not_registered",
        message: "Run: npm run register:webhook",
      },
      { status: 404 }
    );
  }

  const now      = Date.now();
  const msLeft   = channel.expiresAt.getTime() - now;
  const daysLeft = Math.floor(msLeft / (24 * 60 * 60 * 1000));

  return NextResponse.json({
    status:    daysLeft > 0 ? "active" : "expired",
    channelId: channel.channelId,
    expiresAt: channel.expiresAt,
    expiresIn: `${daysLeft} day(s)`,
    daysLeft,
    renewedAt: channel.renewedAt ?? null,
    pageToken: channel.pageToken.slice(0, 16) + "…",
  });
}
