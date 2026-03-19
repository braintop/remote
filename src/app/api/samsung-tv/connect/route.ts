import { NextRequest, NextResponse } from "next/server";
import { connectToTv, validateIp } from "@/lib/samsung-tv";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tvIp, token } = body as { tvIp: string; token?: string };

    const validation = validateIp(tvIp);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const result = await connectToTv(tvIp.trim(), token);

    if (result.success) {
      return NextResponse.json({ success: true, token: result.token });
    } else {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
