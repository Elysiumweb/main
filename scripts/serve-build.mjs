#!/usr/bin/env node
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve("build");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3000);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ics": "text/calendar; charset=utf-8",
};

const safePath = (urlPath) => {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const candidate = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  return resolve(join(root, candidate));
};

const sendFile = (res, filePath) => {
  res.writeHead(200, {
    "Content-Type": types[extname(filePath).toLowerCase()] || "application/octet-stream",
    "Cache-Control": filePath.includes(`${root}/static/`) ? "public, max-age=31536000, immutable" : "no-store",
  });
  createReadStream(filePath).pipe(res);
};

const server = createServer((req, res) => {
  if (!existsSync(root)) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Build directory missing. Run npm run build first.");
    return;
  }

  const requested = safePath(req.url || "/");
  const insideRoot = requested === root || requested.startsWith(`${root}/`);
  const filePath = insideRoot && existsSync(requested) && statSync(requested).isFile()
    ? requested
    : join(root, "index.html");
  sendFile(res, filePath);
});

server.listen(port, host, () => {
  console.log(`[serve-build] http://${host}:${port}`);
});
