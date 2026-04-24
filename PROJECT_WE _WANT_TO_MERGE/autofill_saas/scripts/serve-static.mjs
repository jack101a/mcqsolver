import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const [targetDirArg = "./", portArg = "4100"] = process.argv.slice(2);
const rootDir = path.resolve(__dirname, "..", targetDirArg);
const port = Number.parseInt(portArg, 10);

if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid port: ${portArg}`);
}

const mimeByExt = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

const safeResolve = (urlPath) => {
  const cleanPath = decodeURIComponent((urlPath || "/").split("?")[0]);
  const relative = cleanPath === "/" ? "index.html" : cleanPath.replace(/^\/+/, "");
  const absolute = path.resolve(rootDir, relative);
  if (!absolute.startsWith(rootDir)) {
    return null;
  }
  return absolute;
};

const server = createServer(async (request, response) => {
  const filePath = safeResolve(request.url || "/");
  if (!filePath) {
    response.statusCode = 400;
    response.end("Bad request");
    return;
  }

  try {
    const buffer = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.statusCode = 200;
    response.setHeader("Content-Type", mimeByExt[extension] || "application/octet-stream");
    response.end(buffer);
  } catch (_error) {
    response.statusCode = 404;
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Static server running: http://127.0.0.1:${port}\n`);
  process.stdout.write(`Serving directory: ${rootDir}\n`);
});
