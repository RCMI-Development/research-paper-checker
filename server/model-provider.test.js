import assert from "node:assert/strict";
import test from "node:test";
import { askModel, getModelProvider, getProviderHealth } from "./model-provider.js";

test("LM Studio remains the default provider", () => {
  const provider = getModelProvider({});
  assert.equal(provider.id, "lmstudio");
  assert.equal(provider.baseUrl, "http://localhost:1234/v1");
  assert.equal(provider.configured, true);
  assert.equal(provider.headers.Authorization, undefined);
});

test("OpenRouter requires a key without exposing it in health data", async () => {
  const provider = getModelProvider({ AI_PROVIDER: "openrouter", OPENROUTER_MODEL: "vendor/model" });
  const health = await getProviderHealth(provider, () => {
    throw new Error("fetch should not run");
  });
  assert.equal(health.configured, false);
  assert.equal(health.reachable, false);
  assert.equal(health.model, "vendor/model");
  assert.equal(JSON.stringify(health).includes("Bearer"), false);
});

test("OpenRouter sends authenticated OpenAI-compatible chat requests", async () => {
  const provider = getModelProvider({
    AI_PROVIDER: "openrouter",
    OPENROUTER_API_KEY: "secret-test-key",
    OPENROUTER_MODEL: "vendor/model",
    OPENROUTER_SITE_URL: "https://example.edu",
    OPENROUTER_APP_NAME: "Test Checker",
  });
  let request;
  const data = await askModel(provider, "instructions", "proposal text", async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ choices: [{ message: { content: "{}" } }] }) };
  });

  assert.equal(request.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(request.options.headers.Authorization, "Bearer secret-test-key");
  assert.equal(request.options.headers["HTTP-Referer"], "https://example.edu");
  assert.equal(request.options.headers["X-OpenRouter-Title"], "Test Checker");
  assert.equal(JSON.parse(request.options.body).model, "vendor/model");
  assert.equal(data.choices[0].message.content, "{}");
});

test("health reports whether the selected model exists", async () => {
  const provider = getModelProvider({
    AI_PROVIDER: "openrouter",
    OPENROUTER_API_KEY: "secret-test-key",
    OPENROUTER_MODEL: "vendor/model",
  });
  const health = await getProviderHealth(provider, async () => ({
    ok: true,
    json: async () => ({ data: [{ id: "vendor/model" }] }),
  }));
  assert.equal(health.reachable, true);
  assert.equal(health.loaded, true);
  assert.equal(health.providerLabel, "OpenRouter");
});
