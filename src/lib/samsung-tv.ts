import WebSocket from "ws";

const APP_NAME = Buffer.from("SamsungTvRemote").toString("base64");

const VALID_KEYS = new Set([
  "KEY_POWER",
  "KEY_VOLUP",
  "KEY_VOLDOWN",
  "KEY_MUTE",
  "KEY_CHUP",
  "KEY_CHDOWN",
  "KEY_UP",
  "KEY_DOWN",
  "KEY_LEFT",
  "KEY_RIGHT",
  "KEY_ENTER",
  "KEY_RETURN",
  "KEY_HOME",
  "KEY_SOURCE",
  "KEY_MENU",
  "KEY_INFO",
  "KEY_PLAY",
  "KEY_PAUSE",
  "KEY_STOP",
  "KEY_REWIND",
  "KEY_FF",
  "KEY_0",
  "KEY_1",
  "KEY_2",
  "KEY_3",
  "KEY_4",
  "KEY_5",
  "KEY_6",
  "KEY_7",
  "KEY_8",
  "KEY_9",
]);

export function isValidKey(key: string): boolean {
  return VALID_KEYS.has(key);
}

interface ConnectionEntry {
  ws: WebSocket;
  lastActivity: number;
  token?: string;
}

const connectionPool = new Map<string, ConnectionEntry>();

// Cleanup stale connections every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of connectionPool) {
    if (now - entry.lastActivity > 5 * 60 * 1000) {
      entry.ws.close();
      connectionPool.delete(ip);
    }
  }
}, 60_000);

function isPrivateIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  // 10.x.x.x
  if (parts[0] === 10) return true;
  // 172.16.x.x - 172.31.x.x
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.x.x
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

export function validateIp(ip: string): { valid: boolean; error?: string } {
  if (!ip || typeof ip !== "string") {
    return { valid: false, error: "IP address is required" };
  }
  const trimmed = ip.trim();
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) {
    return { valid: false, error: "Invalid IP address format" };
  }
  if (!isPrivateIp(trimmed)) {
    return { valid: false, error: "Only private/local network IPs are allowed" };
  }
  return { valid: true };
}

export function getConnectionStatus(tvIp: string): boolean {
  const entry = connectionPool.get(tvIp);
  if (!entry) return false;
  if (entry.ws.readyState !== WebSocket.OPEN) {
    connectionPool.delete(tvIp);
    return false;
  }
  return true;
}

export async function connectToTv(
  tvIp: string,
  token?: string
): Promise<{ success: boolean; token?: string; error?: string }> {
  // If already connected, return success
  const existing = connectionPool.get(tvIp);
  if (existing && existing.ws.readyState === WebSocket.OPEN) {
    existing.lastActivity = Date.now();
    return { success: true, token: existing.token };
  }

  // Clean up stale entry
  if (existing) {
    connectionPool.delete(tvIp);
  }

  const tokenParam = token ? `&token=${token}` : "";
  const url = `wss://${tvIp}:8002/api/v2/channels/samsung.remote.control?name=${APP_NAME}${tokenParam}`;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      ws.close();
      resolve({ success: false, error: "Connection timed out. Make sure the TV is on and on the same network." });
    }, 30_000);

    const ws = new WebSocket(url, { rejectUnauthorized: false });

    ws.on("open", () => {
      // Connection opened, waiting for TV response with token
    });

    ws.on("message", (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.event === "ms.channel.connect") {
          clearTimeout(timeout);
          const newToken = msg.data?.token || token;
          connectionPool.set(tvIp, {
            ws,
            lastActivity: Date.now(),
            token: newToken,
          });
          resolve({ success: true, token: newToken });
        } else if (msg.event === "ms.channel.unauthorized") {
          clearTimeout(timeout);
          ws.close();
          resolve({ success: false, error: "Connection was denied on the TV. Please try again and accept the popup." });
        }
      } catch {
        // Ignore non-JSON messages
      }
    });

    ws.on("error", (err: Error) => {
      clearTimeout(timeout);
      connectionPool.delete(tvIp);
      resolve({ success: false, error: `Connection error: ${err.message}` });
    });

    ws.on("close", () => {
      clearTimeout(timeout);
      connectionPool.delete(tvIp);
    });
  });
}

export function sendKey(
  tvIp: string,
  keyCode: string
): { success: boolean; error?: string } {
  const entry = connectionPool.get(tvIp);
  if (!entry || entry.ws.readyState !== WebSocket.OPEN) {
    connectionPool.delete(tvIp);
    return { success: false, error: "Not connected to TV" };
  }

  if (!isValidKey(keyCode)) {
    return { success: false, error: `Invalid key code: ${keyCode}` };
  }

  entry.lastActivity = Date.now();

  const command = JSON.stringify({
    method: "ms.remote.control",
    params: {
      Cmd: "Click",
      DataOfCmd: keyCode,
      Option: "false",
      TypeOfRemote: "SendRemoteKey",
    },
  });

  entry.ws.send(command);
  return { success: true };
}

export function disconnectFromTv(tvIp: string): { success: boolean } {
  const entry = connectionPool.get(tvIp);
  if (entry) {
    entry.ws.close();
    connectionPool.delete(tvIp);
  }
  return { success: true };
}
