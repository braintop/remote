"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type Status = "disconnected" | "connecting" | "connected" | "error" | "ssl_required";

const APP_NAME = typeof window !== "undefined" ? btoa("SamsungTvRemote") : "";

export default function RemotePage() {
  const [tvIp, setTvIp] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<Status>("disconnected");
  const [errorMsg, setErrorMsg] = useState("");
  const [lastPressed, setLastPressed] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  // Load saved settings
  useEffect(() => {
    const savedIp = localStorage.getItem("samsung_tv_ip") || "";
    const savedToken = localStorage.getItem("samsung_tv_token") || "";
    setTvIp(savedIp);
    setToken(savedToken);
  }, []);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const handleConnect = async () => {
    const ip = tvIp.trim();
    if (!ip) {
      setErrorMsg("Please enter the TV IP address");
      setStatus("error");
      return;
    }

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setStatus("connecting");
    setErrorMsg("");

    const savedToken = token || localStorage.getItem("samsung_tv_token") || "";
    const tokenParam = savedToken ? `&token=${savedToken}` : "";
    const url = `wss://${ip}:8002/api/v2/channels/samsung.remote.control?name=${APP_NAME}${tokenParam}`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      const timeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          setStatus("ssl_required");
          setErrorMsg(ip);
        }
      }, 8000);

      ws.onopen = () => {
        // Connection opened, waiting for TV response
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === "ms.channel.connect") {
            clearTimeout(timeout);
            const newToken = msg.data?.token || savedToken;
            if (newToken) {
              setToken(newToken);
              localStorage.setItem("samsung_tv_token", newToken);
            }
            localStorage.setItem("samsung_tv_ip", ip);
            setStatus("connected");
          } else if (msg.event === "ms.channel.unauthorized") {
            clearTimeout(timeout);
            ws.close();
            setStatus("error");
            setErrorMsg("Connection denied on TV. Try again and accept the popup.");
          }
        } catch {
          // Ignore non-JSON messages
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        if (status !== "connected") {
          setStatus("ssl_required");
          setErrorMsg(ip);
        }
      };

      ws.onclose = () => {
        clearTimeout(timeout);
        if (wsRef.current === ws) {
          wsRef.current = null;
          if (status === "connected") {
            setStatus("disconnected");
            setErrorMsg("Connection closed");
          }
        }
      };
    } catch {
      setStatus("ssl_required");
      setErrorMsg(ip);
    }
  };

  const handleDisconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("disconnected");
    setErrorMsg("");
  };

  const sendCommand = useCallback(
    (keyCode: string) => {
      if (status !== "connected" || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      setLastPressed(keyCode);

      const command = JSON.stringify({
        method: "ms.remote.control",
        params: {
          Cmd: "Click",
          DataOfCmd: keyCode,
          Option: "false",
          TypeOfRemote: "SendRemoteKey",
        },
      });

      try {
        wsRef.current.send(command);
      } catch {
        setErrorMsg("Failed to send command");
        setStatus("disconnected");
      }

      setTimeout(() => setLastPressed(""), 150);
    },
    [status]
  );

  // Keyboard shortcuts
  useEffect(() => {
    if (status !== "connected") return;

    const keyMap: Record<string, string> = {
      ArrowUp: "KEY_UP",
      ArrowDown: "KEY_DOWN",
      ArrowLeft: "KEY_LEFT",
      ArrowRight: "KEY_RIGHT",
      Enter: "KEY_ENTER",
      Backspace: "KEY_RETURN",
      Escape: "KEY_HOME",
      "+": "KEY_VOLUP",
      "=": "KEY_VOLUP",
      "-": "KEY_VOLDOWN",
      m: "KEY_MUTE",
      M: "KEY_MUTE",
      PageUp: "KEY_CHUP",
      PageDown: "KEY_CHDOWN",
      i: "KEY_INFO",
      I: "KEY_INFO",
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const cmd = keyMap[e.key];
      if (cmd) {
        e.preventDefault();
        sendCommand(cmd);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [status, sendCommand]);

  // Monitor WebSocket connection
  useEffect(() => {
    if (status !== "connected") return;

    const interval = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        setStatus("disconnected");
        setErrorMsg("Connection lost");
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [status]);

  const btnClass = (keyCode: string, extra = "") =>
    `remote-btn flex items-center justify-center transition-all duration-100 ${
      lastPressed === keyCode ? "scale-90 brightness-75" : "active:scale-90"
    } ${extra}`;

  return (
    <div className="flex flex-col items-center min-h-screen bg-zinc-950 px-4 py-6">
      {/* Header */}
      <h1 className="text-xl font-bold text-zinc-100 mb-4">
        Samsung TV Remote
      </h1>

      {/* Connection Panel */}
      {status !== "connected" ? (
        <div className="w-full max-w-sm bg-zinc-900 rounded-2xl p-5 border border-zinc-800 mb-6">
          <label className="block text-sm font-medium text-zinc-400 mb-2">
            TV IP Address
          </label>
          <div className="flex gap-2" dir="ltr">
            <input
              type="text"
              value={tvIp}
              onChange={(e) => setTvIp(e.target.value)}
              placeholder="192.168.1.XXX"
              className="flex-1 px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder:text-zinc-600 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              dir="ltr"
            />
            <button
              onClick={handleConnect}
              disabled={status === "connecting"}
              className="px-5 py-2.5 rounded-xl bg-amber-500 text-zinc-950 font-bold text-sm hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "connecting" ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  ...
                </span>
              ) : (
                "Connect"
              )}
            </button>
          </div>

          {status === "connecting" && (
            <p className="text-amber-400 text-xs mt-3 text-center">
              Connecting... Accept the popup on your TV if this is the first time.
            </p>
          )}

          {status === "ssl_required" && (
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <p className="text-amber-400 text-xs font-bold mb-2 text-center">
                SSL Certificate Required
              </p>
              <p className="text-zinc-400 text-xs mb-3 text-center">
                First, open this link and accept the security warning:
              </p>
              <a
                href={`https://${errorMsg}:8002/api/v2/`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center px-4 py-2 rounded-lg bg-amber-500 text-zinc-950 text-xs font-bold hover:bg-amber-400 transition-colors"
                dir="ltr"
              >
                Open https://{errorMsg}:8002
              </a>
              <p className="text-zinc-500 text-xs mt-2 text-center">
                After accepting, come back and click Connect again.
              </p>
            </div>
          )}

          {status === "error" && errorMsg && (
            <p className="text-red-400 text-xs mt-3 text-center">{errorMsg}</p>
          )}

          {token && status === "disconnected" && (
            <p className="text-zinc-600 text-xs mt-3 text-center">
              Saved token found - will auto-pair
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Connected indicator */}
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-green-400 text-sm" dir="ltr">
              Connected to {tvIp}
            </span>
            <button
              onClick={handleDisconnect}
              className="text-zinc-500 text-xs hover:text-zinc-300 mr-2"
            >
              Disconnect
            </button>
          </div>

          {errorMsg && (
            <p className="text-red-400 text-xs mb-3">{errorMsg}</p>
          )}

          {/* Remote Control Body */}
          <div dir="ltr" className="w-full max-w-[280px] bg-zinc-900 rounded-[2rem] p-6 pb-8 border border-zinc-800 shadow-2xl shadow-black/50">

            {/* Row 1: Power + Source */}
            <div className="flex justify-between items-center mb-8 px-2">
              <button
                onClick={() => sendCommand("KEY_POWER")}
                className={btnClass(
                  "KEY_POWER",
                  "w-12 h-12 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/30"
                )}
                title="Power"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v9" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 11-12.728 0" />
                </svg>
              </button>

              <button
                onClick={() => sendCommand("KEY_SOURCE")}
                className={btnClass(
                  "KEY_SOURCE",
                  "w-12 h-12 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                )}
                title="Source"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </button>
            </div>

            {/* Row 2: D-Pad */}
            <div className="flex justify-center mb-6">
              <div className="relative w-48 h-48">
                <div className="absolute inset-0 rounded-full bg-zinc-800 border border-zinc-700" />

                <button
                  onClick={() => sendCommand("KEY_UP")}
                  className={btnClass("KEY_UP", "absolute top-1 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full text-zinc-300 hover:text-white hover:bg-zinc-700/50 z-10")}
                >
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                  </svg>
                </button>

                <button
                  onClick={() => sendCommand("KEY_DOWN")}
                  className={btnClass("KEY_DOWN", "absolute bottom-1 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full text-zinc-300 hover:text-white hover:bg-zinc-700/50 z-10")}
                >
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                <button
                  onClick={() => sendCommand("KEY_LEFT")}
                  className={btnClass("KEY_LEFT", "absolute left-1 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full text-zinc-300 hover:text-white hover:bg-zinc-700/50 z-10")}
                >
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>

                <button
                  onClick={() => sendCommand("KEY_RIGHT")}
                  className={btnClass("KEY_RIGHT", "absolute right-1 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full text-zinc-300 hover:text-white hover:bg-zinc-700/50 z-10")}
                >
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>

                <button
                  onClick={() => sendCommand("KEY_ENTER")}
                  className={btnClass("KEY_ENTER", "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-zinc-700 hover:bg-zinc-600 text-white font-bold text-sm border-2 border-zinc-600 z-20 shadow-inner")}
                >
                  OK
                </button>
              </div>
            </div>

            {/* Row 3: Back, Home, Menu */}
            <div className="flex justify-center gap-6 mb-8">
              <button onClick={() => sendCommand("KEY_RETURN")} className={btnClass("KEY_RETURN", "w-12 h-12 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700")} title="Back">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
              </button>
              <button onClick={() => sendCommand("KEY_HOME")} className={btnClass("KEY_HOME", "w-12 h-12 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700")} title="Home">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>
              </button>
              <button onClick={() => sendCommand("KEY_MENU")} className={btnClass("KEY_MENU", "w-12 h-12 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700")} title="Menu">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
              </button>
            </div>

            {/* Row 4: Volume + Channel */}
            <div className="flex justify-between items-center px-2 mb-6">
              <div className="flex flex-col items-center gap-0">
                <button onClick={() => sendCommand("KEY_VOLUP")} className={btnClass("KEY_VOLUP", "w-14 h-10 rounded-t-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 border-b-0 text-lg font-bold")}>+</button>
                <button onClick={() => sendCommand("KEY_MUTE")} className={btnClass("KEY_MUTE", "w-14 h-8 bg-zinc-800 hover:bg-zinc-700 text-zinc-500 border-x border-zinc-700 text-[10px] font-medium")}>MUTE</button>
                <button onClick={() => sendCommand("KEY_VOLDOWN")} className={btnClass("KEY_VOLDOWN", "w-14 h-10 rounded-b-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 border-t-0 text-lg font-bold")}>-</button>
                <span className="text-[10px] text-zinc-600 mt-1">VOL</span>
              </div>

              <button onClick={() => sendCommand("KEY_INFO")} className={btnClass("KEY_INFO", "w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 border border-zinc-700 text-xs font-bold")} title="Info">i</button>

              <div className="flex flex-col items-center gap-0">
                <button onClick={() => sendCommand("KEY_CHUP")} className={btnClass("KEY_CHUP", "w-14 h-10 rounded-t-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 border-b-0")}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                </button>
                <div className="w-14 h-8 bg-zinc-800 border-x border-zinc-700 flex items-center justify-center"><span className="text-[10px] text-zinc-600">CH</span></div>
                <button onClick={() => sendCommand("KEY_CHDOWN")} className={btnClass("KEY_CHDOWN", "w-14 h-10 rounded-b-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 border-t-0")}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </button>
                <span className="text-[10px] text-zinc-600 mt-1">CH</span>
              </div>
            </div>

            {/* Row 5: Number pad */}
            <div className="grid grid-cols-3 gap-2 px-2 mb-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button key={n} onClick={() => sendCommand(`KEY_${n}`)} className={btnClass(`KEY_${n}`, "h-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/50 text-sm font-medium")}>{n}</button>
              ))}
              <div />
              <button onClick={() => sendCommand("KEY_0")} className={btnClass("KEY_0", "h-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/50 text-sm font-medium")}>0</button>
              <div />
            </div>

            {/* Row 6: Media Controls */}
            <div className="flex justify-center gap-3 px-2">
              <button onClick={() => sendCommand("KEY_REWIND")} className={btnClass("KEY_REWIND", "w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 border border-zinc-700/50")} title="Rewind">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M11.5 12L22 6v12l-10.5-6zM2 6l10.5 6L2 18V6z" /></svg>
              </button>
              <button onClick={() => sendCommand("KEY_PLAY")} className={btnClass("KEY_PLAY", "w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 border border-zinc-700/50")} title="Play">
                <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              </button>
              <button onClick={() => sendCommand("KEY_PAUSE")} className={btnClass("KEY_PAUSE", "w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 border border-zinc-700/50")} title="Pause">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
              </button>
              <button onClick={() => sendCommand("KEY_STOP")} className={btnClass("KEY_STOP", "w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 border border-zinc-700/50")} title="Stop">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>
              </button>
              <button onClick={() => sendCommand("KEY_FF")} className={btnClass("KEY_FF", "w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 border border-zinc-700/50")} title="Fast Forward">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M2 6l10.5 6L2 18V6zm10.5 0l10.5 6-10.5 6V6z" /></svg>
              </button>
            </div>
          </div>

          {/* Keyboard shortcuts hint */}
          <div className="mt-6 text-center text-zinc-600 text-[11px] max-w-[280px]" dir="ltr">
            <p>Keyboard: Arrows = Navigate, Enter = OK, Backspace = Back</p>
            <p>+/- = Volume, M = Mute, PageUp/Down = Channel</p>
          </div>
        </>
      )}
    </div>
  );
}
