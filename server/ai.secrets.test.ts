import { describe, expect, it } from "vitest";

describe("server AI credentials", () => {
  it("accepts the configured Gemini key on the models endpoint", async () => {
    const key = process.env.GEMINI_API_KEY;
    expect(key, "GEMINI_API_KEY must be configured").toBeTruthy();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key!)}`);
    expect(response.ok, `Gemini credential check returned ${response.status}`).toBe(true);
  }, 15_000);

  it("accepts the configured Fal.ai key on the models endpoint", async () => {
    const key = process.env.FAL_KEY;
    expect(key, "FAL_KEY must be configured").toBeTruthy();
    const response = await fetch("https://api.fal.ai/v1/models?limit=1", {
      headers: { Authorization: `Key ${key}` },
    });
    expect(response.ok, `Fal.ai credential check returned ${response.status}`).toBe(true);
  }, 15_000);
});
