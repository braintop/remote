import { NextRequest, NextResponse } from "next/server";
import { sendKey, validateIp } from "@/lib/samsung-tv";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tvIp, keyCode } = body as { tvIp: string; keyCode: string };

    const validation = validateIp(tvIp);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    if (!keyCode || typeof keyCode !== "string") {
      return NextResponse.json({ error: "keyCode is required" }, { status: 400 });
    }

    const result = sendKey(tvIp.trim(), keyCode);

    if (result.success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === "Not connected to TV" ? 409 : 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
