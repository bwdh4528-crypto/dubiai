import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { storageGetSignedUrl } from "./storage";

const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_HISTORY = 24;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(12000),
  imageKey: z.string().max(300).optional(),
});

function requireGeminiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured on the server");
  return key;
}

function requireFalKey() {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not configured on the server");
  return key;
}

async function inlineDataFromKey(imageKey: string) {
  const signedUrl = await storageGetSignedUrl(imageKey);
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error("Uploaded image could not be read from storage");
  const mimeType = response.headers.get("content-type") ?? "image/jpeg";
  const data = Buffer.from(await response.arrayBuffer()).toString("base64");
  return { mimeType, data };
}

async function runGemini(input: { messages: z.infer<typeof messageSchema>[]; grounded: boolean }) {
  const contents = await Promise.all(input.messages.slice(-MAX_HISTORY).map(async message => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [
      { text: message.text },
      ...(message.imageKey ? [{ inlineData: await inlineDataFromKey(message.imageKey) }] : []),
    ],
  })));

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: "אתה נשמה, עוזר AI אישי בעברית. היה מדויק, תמציתי ואדיב. כאשר מופיע מידע מהרשת, ציין בבירור מה נבדק ומה המקור. אל תמציא עובדות או קופונים." }] },
    contents,
    generationConfig: { temperature: 0.35, maxOutputTokens: 1400 },
  };
  if (input.grounded) body.tools = [{ google_search: {} }];

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(requireGeminiKey())}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
  const data = await response.json() as any;
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((part: any) => part.text).filter(Boolean).join("\n") ?? "לא הצלחתי להפיק תשובה כרגע.";
  const grounding = candidate?.groundingMetadata;
  const sources = (grounding?.groundingChunks ?? []).map((chunk: any) => chunk.web).filter(Boolean).map((web: any) => ({ title: web.title ?? "מקור", uri: web.uri })).filter((source: any) => source.uri);
  return { text, grounded: Boolean(grounding), sources };
}

async function runFal(endpoint: string, input: Record<string, unknown>) {
  const response = await fetch(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Key ${requireFalKey()}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`Fal.ai request failed: ${response.status}`);
  return await response.json() as any;
}

function firstMediaUrl(data: any, kind: "image" | "video") {
  const url = kind === "image"
    ? data?.images?.[0]?.url ?? data?.image?.url ?? data?.url
    : data?.video?.url ?? data?.videos?.[0]?.url ?? data?.url;
  if (!url) throw new Error("Fal.ai returned no media URL");
  return url as string;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  ai: router({
    chat: publicProcedure.input(z.object({ messages: z.array(messageSchema).min(1).max(MAX_HISTORY), grounded: z.boolean().default(false) })).mutation(({ input }) => runGemini(input)),
    generateImage: publicProcedure.input(z.object({ prompt: z.string().trim().min(3).max(4000) })).mutation(async ({ input }) => ({ url: firstMediaUrl(await runFal("fal-ai/flux/dev", { prompt: input.prompt, num_images: 1 }), "image") })),
    editImage: publicProcedure.input(z.object({ prompt: z.string().trim().min(3).max(4000), imageKey: z.string().max(300) })).mutation(async ({ input }) => ({ url: firstMediaUrl(await runFal("fal-ai/flux-pro/kontext", { prompt: input.prompt, image_url: await storageGetSignedUrl(input.imageKey) }), "image") })),
    generateVideo: publicProcedure.input(z.object({ prompt: z.string().trim().min(3).max(4000) })).mutation(async ({ input }) => ({ url: firstMediaUrl(await runFal("fal-ai/wan/v2.1/1.3b/text-to-video", { prompt: input.prompt }), "video") })),
  }),
});

export type AppRouter = typeof appRouter;
