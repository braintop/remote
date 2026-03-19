import { NextRequest, NextResponse } from "next/server";
import { disconnectFromTv, validateIp } from "@/lib/samsung-tv";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tvIp } = body as { tvIp: string };

    const validation = validateIp(tvIp);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    disconnectFromTv(tvIp.trim());
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
