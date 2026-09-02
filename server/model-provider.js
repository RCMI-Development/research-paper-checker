/* Los proveedores locales hablan la misma API compatible con OpenAI: solo cambian
   la etiqueta, el puerto por defecto y las variables que los configuran. */
const LOCAL_PROVIDERS = {
  lmstudio: {
    label: "LM Studio",
    urlKey: "LM_STUDIO_URL",
    modelKey: "LM_STUDIO_MODEL",
    defaultUrl: "http://localhost:1234/v1",
    defaultModel: "openai/gpt-oss-20b",
  },
  ollama: {
    label: "Ollama",
    urlKey: "OLLAMA_URL",
    modelKey: "OLLAMA_MODEL",
    defaultUrl: "http://127.0.0.1:11434/v1",
    defaultModel: "llama3.1:8b",
  },
};

const PROVIDERS = new Set([...Object.keys(LOCAL_PROVIDERS), "openrouter"]);

const withoutTrailingSlash = (value) => value.replace(/\/+$/, "");

export function getModelProvider(env = process.env) {
  const id = (env.AI_PROVIDER || "lmstudio").trim().toLowerCase();
  if (!PROVIDERS.has(id)) {
    throw new Error(
      `AI_PROVIDER debe ser "lmstudio", "ollama" u "openrouter"; se recibió "${id}"`,
    );
  }

  if (id === "openrouter") {
    const apiKey = (env.OPENROUTER_API_KEY || "").trim();
    const headers = {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(env.OPENROUTER_SITE_URL ? { "HTTP-Referer": env.OPENROUTER_SITE_URL } : {}),
      "X-OpenRouter-Title": env.OPENROUTER_APP_NAME || "RCM Research Paper Checker",
    };
    return {
      id,
      label: "OpenRouter",
      baseUrl: withoutTrailingSlash(env.OPENROUTER_URL || "https://openrouter.ai/api/v1"),
      model: env.OPENROUTER_MODEL || "openai/gpt-oss-20b",
      headers,
      configured: Boolean(apiKey),
      configurationError: apiKey ? null : "Falta OPENROUTER_API_KEY en .env",
      remote: true,
    };
  }

  const local = LOCAL_PROVIDERS[id];
  return {
    id,
    label: local.label,
    baseUrl: withoutTrailingSlash(env[local.urlKey] || local.defaultUrl),
    model: env[local.modelKey] || local.defaultModel,
    headers: { "Content-Type": "application/json" },
    configured: true,
    configurationError: null,
    remote: false,
  };
}

export async function getProviderHealth(provider, fetchImpl = fetch) {
  if (!provider.configured) {
    return {
      ok: true,
      provider: provider.id,
      providerLabel: provider.label,
      configured: false,
      reachable: false,
      remote: provider.remote,
      model: provider.model,
      error: provider.configurationError,
    };
  }

  try {
    const response = await fetchImpl(`${provider.baseUrl}/models`, {
      headers: provider.headers,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`${provider.label} respondió ${response.status}: ${body.slice(0, 300)}`);
    }
    const data = await response.json();
    const ids = data.data?.map((model) => model.id) ?? [];
    return {
      ok: true,
      provider: provider.id,
      providerLabel: provider.label,
      configured: true,
      reachable: true,
      remote: provider.remote,
      model: provider.model,
      loaded: ids.includes(provider.model),
    };
  } catch (error) {
    return {
      ok: true,
      provider: provider.id,
      providerLabel: provider.label,
      configured: true,
      reachable: false,
      remote: provider.remote,
      model: provider.model,
      error: String(error.message || error),
    };
  }
}

export async function askModel(provider, prompt, proposalText, fetchImpl = fetch) {
  if (!provider.configured) throw new Error(provider.configurationError);

  /* Sin señal, undici espera 300 s por las cabeceras: un modelo local atascado
     o cargándose en frío deja la pestaña girando sin explicación. */
  const timeoutMs = Number(process.env.MODEL_TIMEOUT_MS) || 240000;

  const response = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: provider.headers,
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.2,
      max_tokens: 2500,
      messages: [
        {
          role: "system",
          content: "You are a compliance screening assistant. Respond with strict JSON only — no markdown fences, no commentary, no text before or after the JSON object.",
        },
        { role: "user", content: `${prompt}\n\n<propuesta>\n${proposalText}\n</propuesta>` },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${provider.label} respondió ${response.status}: ${body.slice(0, 300)}`);
  }
  return response.json();
}
