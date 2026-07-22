import { NextResponse } from "next/server";
import { networkInterfaces } from "os";

export async function GET() {
  const nets = networkInterfaces();
  const ips: string[] = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return NextResponse.json({
    ip: ips[0] ?? "localhost",
    ips: ips.length > 0 ? ips : ["localhost"],
  });
}
