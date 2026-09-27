import { spawn, type ChildProcess } from "node:child_process";

// Strip ANSI escape codes to ensure reliable regex matching against CLI output
// eslint-disable-next-line no-control-regex
const stripAnsi = (str: string): string => str.replace(/\u001b\[[0-9;]*m/g, "");

const main = () => {
  const forwardedArgs = process.argv.slice(2);
  let resolvedPort: number | null = null;
  let viteProcess: ChildProcess | null = null;
  let tunnelProcess: ChildProcess | null = null;
  let tunnelStarted = false;
  let isShuttingDown = false;

  const cleanup = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    if (tunnelProcess && !tunnelProcess.killed) {
      try {
        tunnelProcess.kill("SIGTERM");
      } catch {}
    }
    if (viteProcess && !viteProcess.killed) {
      try {
        viteProcess.kill("SIGTERM");
      } catch {}
    }

    setTimeout(() => {
      if (tunnelProcess && !tunnelProcess.killed) {
        try {
          tunnelProcess.kill("SIGKILL");
        } catch {}
      }
      if (viteProcess && !viteProcess.killed) {
        try {
          viteProcess.kill("SIGKILL");
        } catch {}
      }
      process.exit(0);
    }, 2000);
  };

  process.on("SIGINT", () => {
    console.log("\n\x1b[33mShutting down Vite and Cloudflare Tunnel...\x1b[0m");
    cleanup();
  });
  process.on("SIGTERM", cleanup);
  process.on("SIGHUP", cleanup);
  process.on("exit", cleanup);

  console.log("\x1b[1m\x1b[36m➜ Starting Vite dev server with Cloudflare Tunnel...\x1b[0m\n");

  // 1. Launch Vite
  viteProcess = spawn("bun", ["x", "vite", ...forwardedArgs], {
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
  });

  const startTunnel = (port: number) => {
    if (tunnelStarted) return;
    tunnelStarted = true;
    resolvedPort = port;

    console.log(`\n\x1b[36m➜ Exposing port ${port} via Cloudflare Tunnel...\x1b[0m`);

    try {
      tunnelProcess = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`], {
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err: any) {
      console.warn(
        `\x1b[33m⚠️ Failed to launch cloudflared: ${err?.message || err}. Dev server running on http://localhost:${port}\x1b[0m`,
      );
      return;
    }

    tunnelProcess.on("error", (err: any) => {
      if (err.code === "ENOENT") {
        console.warn(
          "\n\x1b[33m⚠️ 'cloudflared' command not found in PATH.\x1b[0m\n" +
            "Dev server is running locally. To enable tunnels, install cloudflared:\n" +
            "  brew install cloudflared (macOS) or visit https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/\n",
        );
      } else {
        console.warn(`\x1b[33m⚠️ Cloudflare Tunnel error: ${err.message}\x1b[0m`);
      }
    });

    let tunnelUrlLogged = false;

    const handleTunnelData = (data: Buffer | string) => {
      const text = data.toString();
      const clean = stripAnsi(text);

      if (!tunnelUrlLogged) {
        const match = clean.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i);
        if (match) {
          tunnelUrlLogged = true;
          const url = match[0];
          console.log(
            "\n\x1b[1m\x1b[32m┌─────────────────────────────────────────────────────────────┐\x1b[0m",
          );
          console.log(
            `\x1b[1m\x1b[32m│  🚀 Cloudflare Tunnel Ready!                                │\x1b[0m`,
          );
          console.log(
            `\x1b[1m\x1b[32m│  ➜ Tunnel (HTTPS): \x1b[36m${url.padEnd(41)}\x1b[32m│\x1b[0m`,
          );
          console.log(
            `\x1b[1m\x1b[32m│  ➜ Local:          \x1b[0mhttp://localhost:${String(resolvedPort).padEnd(24)}\x1b[1m\x1b[32m│\x1b[0m`,
          );
          console.log(
            `\x1b[1m\x1b[32m│  \x1b[90m(HTTPS ready for mobile camera, microphone & Google OAuth) \x1b[32m│\x1b[0m`,
          );
          console.log(
            "\x1b[1m\x1b[32m└─────────────────────────────────────────────────────────────┘\x1b[0m\n",
          );
        }
      }
    };

    tunnelProcess.stdout?.on("data", handleTunnelData);
    tunnelProcess.stderr?.on("data", handleTunnelData);

    tunnelProcess.on("close", (code) => {
      if (!isShuttingDown && code !== 0 && code !== null) {
        console.warn(`\x1b[33m⚠️ Cloudflare Tunnel process exited with code ${code}\x1b[0m`);
      }
    });
  };

  const handleViteData = (data: Buffer | string) => {
    const text = data.toString();
    process.stdout.write(text);

    if (!tunnelStarted) {
      const clean = stripAnsi(text);
      // Match "Local:   http://localhost:5174/" or "Network: http://192.168.1.19:5174/"
      const portMatch = clean.match(/(?:Local|Network):\s+https?:\/\/[^/:]+:(\d+)/i);
      if (portMatch && portMatch[1]) {
        const port = Number.parseInt(portMatch[1], 10);
        if (!Number.isNaN(port)) {
          startTunnel(port);
        }
      }
    }
  };

  viteProcess.stdout?.on("data", handleViteData);
  viteProcess.stderr?.on("data", (data) => process.stderr.write(data));

  // Fallback: If port isn't detected within 30 seconds, fallback to default port 5173
  setTimeout(() => {
    if (!tunnelStarted) {
      startTunnel(5173);
    }
  }, 30000);

  viteProcess.on("close", (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
};

main();
