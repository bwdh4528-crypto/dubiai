import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const context = {
  user: null,
  req: {} as TrpcContext["req"],
  res: {} as TrpcContext["res"],
} satisfies TrpcContext;

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("public AI procedures", () => {
  it("maps Gemini grounded text and web sources without returning credentials", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "תשובה עדכנית" }] }, groundingMetadata: { groundingChunks: [{ web: { title: "מקור לדוגמה", uri: "https://example.com/source" } }] } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await appRouter.createCaller(context).ai.chat({ grounded: true, messages: [{ role: "user", text: "מה חדש היום?" }] });
    expect(result).toMatchObject({ text: "תשובה עדכנית", grounded: true, sources: [{ title: "מקור לדוגמה", uri: "https://example.com/source" }] });
    expect(JSON.stringify(result)).not.toContain(process.env.GEMINI_API_KEY ?? "__missing_gemini_key__");
    expect(JSON.stringify(result)).not.toContain(process.env.FAL_KEY ?? "__missing_fal_key__");
  });

  it("returns a Fal image URL through the server procedure", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ images: [{ url: "https://cdn.example.com/generated.png" }] }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await appRouter.createCaller(context).ai.generateImage({ prompt: "איור מינימליסטי של ירח" });
    expect(result).toEqual({ url: "https://cdn.example.com/generated.png" });
    expect(globalThis.fetch).toHaveBeenCalledWith("https://fal.run/fal-ai/flux/dev", expect.objectContaining({ headers: expect.objectContaining({ authorization: expect.stringMatching(/^Key /) }) }));
  });

  it("covers image editing and video generation without leaking either server secret", async () => {
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const target = String(url);
      if (target.includes("presign/get")) return new Response(JSON.stringify({ url: "https://storage.example.com/uploaded.jpg" }), { status: 200 });
      if (target.includes("kontext")) return new Response(JSON.stringify({ images: [{ url: "https://cdn.example.com/edited.png" }] }), { status: 200 });
      return new Response(JSON.stringify({ video: { url: "https://cdn.example.com/generated.mp4" } }), { status: 200 });
    });
    const caller = appRouter.createCaller(context);
    const edited = await caller.ai.editImage({ prompt: "הוסף אור רך", imageKey: "assistant-uploads/example.jpg" });
    const video = await caller.ai.generateVideo({ prompt: "גלים רגועים בחוף" });
    expect(edited.url).toBe("https://cdn.example.com/edited.png");
    expect(video.url).toBe("https://cdn.example.com/generated.mp4");
    expect(`${JSON.stringify(edited)}${JSON.stringify(video)}`).not.toContain(process.env.GEMINI_API_KEY ?? "__missing_gemini_key__");
    expect(`${JSON.stringify(edited)}${JSON.stringify(video)}`).not.toContain(process.env.FAL_KEY ?? "__missing_fal_key__");
  });

  it("fails clearly when the Fal.ai server secret is missing", async () => {
    const key = process.env.FAL_KEY;
    delete process.env.FAL_KEY;
    await expect(appRouter.createCaller(context).ai.generateImage({ prompt: "בדיקה" })).rejects.toThrow("FAL_KEY is not configured");
    if (key) process.env.FAL_KEY = key;
  });

  it("does not expose credentials in media-procedure failures", async () => {
    const falKey = process.env.FAL_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "upstream failure" }), { status: 500 }));
    try {
      await appRouter.createCaller(context).ai.generateVideo({ prompt: "בדיקת שגיאה" });
      throw new Error("Expected media procedure to fail");
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      expect(message).not.toContain(falKey ?? "__missing_fal_key__");
      expect(message).not.toContain(geminiKey ?? "__missing_gemini_key__");
    }
  });

  it("fails clearly when the Gemini server secret is missing", async () => {
    const key = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    await expect(appRouter.createCaller(context).ai.chat({ grounded: false, messages: [{ role: "user", text: "בדיקה" }] })).rejects.toThrow("GEMINI_API_KEY is not configured");
    if (key) process.env.GEMINI_API_KEY = key;
  });
});
