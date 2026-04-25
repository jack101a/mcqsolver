import { URL } from "node:url";
import net from "node:net";

const defaultLocalDatabaseUrl = "postgres://autofill:autofill@127.0.0.1:5432/autofill";
const databaseUrl = process.env.DATABASE_URL || defaultLocalDatabaseUrl;

const parseTarget = (value) => {
  const parsed = new URL(value);
  return {
    host: parsed.hostname || "127.0.0.1",
    port: Number(parsed.port || 5432),
    database: parsed.pathname.replace(/^\/+/, "") || "postgres"
  };
};

const probeTcp = (host, port, timeoutMs = 2000) =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finalize = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finalize({ ok: true }));
    socket.once("timeout", () => finalize({ ok: false, reason: "timeout" }));
    socket.once("error", (error) => finalize({ ok: false, reason: String(error.message || error) }));
    socket.connect(port, host);
  });

const main = async () => {
  const target = parseTarget(databaseUrl);
  const tcp = await probeTcp(target.host, target.port);
  const summary = {
    databaseUrlSource: process.env.DATABASE_URL ? "env" : "default_local",
    databaseUrl,
    target,
    tcpReachable: tcp.ok,
    tcpReason: tcp.ok ? "reachable" : tcp.reason
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!tcp.ok) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error("DR preflight failed:", error);
  process.exitCode = 1;
});
