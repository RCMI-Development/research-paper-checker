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

test("Ollama is a local OpenAI-compatible provider", () => {
  const provider = getModelProvider({ AI_PROVIDER: "ollama", OLLAMA_MODEL: "gpt-oss:20b" });
  assert.equal(provider.id, "ollama");
  assert.equal(provider.label, "Ollama");
  assert.equal(provider.baseUrl, "http://127.0.0.1:11434/v1");
  assert.equal(provider.model, "gpt-oss:20b");
  assert.equal(provider.remote, false);
  assert.equal(provider.configured, true);
  assert.equal(provider.headers.Authorization, undefined);
});

test("Ollama health reports the tag Ollama itself returns", async () => {
  const provider = getModelProvider({ AI_PROVIDER: "ollama", OLLAMA_MODEL: "llama3.2:3b" });
  const health = await getProviderHealth(provider, async (url) => {
    assert.equal(url, "http://127.0.0.1:11434/v1/models");
    return { ok: true, json: async () => ({ data: [{ id: "llama3.2:3b" }] }) };
  });
  assert.equal(health.providerLabel, "Ollama");
  assert.equal(health.reachable, true);
  assert.equal(health.loaded, true);
});

test("a pulled-but-absent Ollama model is reported as not loaded", async () => {
  const provider = getModelProvider({ AI_PROVIDER: "ollama", OLLAMA_MODEL: "qwen2.5:14b" });
  const health = await getProviderHealth(provider, async () => ({
    ok: true,
    json: async () => ({ data: [{ id: "llama3.2:3b" }] }),
  }));
  assert.equal(health.reachable, true);
  assert.equal(health.loaded, false);
});

test("an unreachable Ollama degrades instead of throwing", async () => {
  const provider = getModelProvider({ AI_PROVIDER: "ollama" });
  const health = await getProviderHealth(provider, async () => {
    throw new Error("ECONNREFUSED");
  });
  assert.equal(health.ok, true);
  assert.equal(health.reachable, false);
  assert.match(health.error, /ECONNREFUSED/);
});

test("unknown providers are rejected by name", () => {
  assert.throws(() => getModelProvider({ AI_PROVIDER: "vllm" }), /vllm/);
});
