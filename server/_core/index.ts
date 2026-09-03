import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { storagePut } from "../storage";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.post("/api/upload-image", express.raw({ type: "image/*", limit: "15mb" }), async (req, res) => {
    const contentType = String(req.get("content-type") ?? "").split(";")[0].toLowerCase();
    if (!contentType.startsWith("image/")) return res.status(415).json({ error: "Only image uploads are supported" });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "Image body is empty" });
    try {
      const rawName = String(req.get("x-file-name") ?? "upload").slice(0, 120);
      const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "-");
      const stored = await storagePut(`assistant-uploads/${crypto.randomUUID()}-${safeName}`, req.body, contentType);
      return res.json(stored);
    } catch (error) {
      console.error("[Upload] Failed to store image", error);
      return res.status(500).json({ error: "Image upload failed" });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
