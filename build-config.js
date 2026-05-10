const fs = require("fs");
const path = require("path");

const rootDir = __dirname;
const envPath = path.join(rootDir, ".env");
const manifestTemplatePath = path.join(rootDir, "manifest.template.json");
const configPath = path.join(rootDir, "config.js");
const manifestPath = path.join(rootDir, "manifest.json");

function parseEnv(text) {
  const result = {};
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function requireValue(env, key) {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

function toNumber(value, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric env value: ${value}`);
  }
  return parsed;
}

function deriveBlockPageUrl(apiBase) {
  return apiBase.replace(/\/api\/extension\/?$/, "/blocked");
}

function buildConfigJs({ apiBase, cacheTtlMs, heartbeatIntervalMs, blockPageUrl }) {
  return `// AUTO-GENERATED - do not edit by hand
const CONFIG = {
  API_BASE: ${JSON.stringify(apiBase)},
  CACHE_TTL_MS: ${cacheTtlMs},
  HEARTBEAT_INTERVAL_MS: ${heartbeatIntervalMs},
  BLOCK_PAGE_URL: ${JSON.stringify(blockPageUrl)}
};
`;
}

function buildManifest(templateText, clientId) {
  const manifest = JSON.parse(templateText);
  manifest.oauth2 = manifest.oauth2 || {};
  manifest.oauth2.client_id = clientId;
  return `${JSON.stringify(manifest, null, 2).replace(/[^\x00-\x7F]/g, (ch) =>
    `\\u${ch.codePointAt(0).toString(16).padStart(4, "0")}`
  )}\n`;
}

function main() {
  if (!fs.existsSync(envPath)) {
    throw new Error("Missing .env file. Copy .env.example to .env and fill values.");
  }
  if (!fs.existsSync(manifestTemplatePath)) {
    throw new Error("Missing manifest.template.json file.");
  }

  const env = parseEnv(fs.readFileSync(envPath, "utf8"));
  const apiBase = requireValue(env, "API_BASE");
  const clientId = requireValue(env, "GOOGLE_CLIENT_ID");
  const cacheTtlMs = toNumber(env.CACHE_TTL_MS, 60000);
  const heartbeatIntervalMs = toNumber(env.HEARTBEAT_INTERVAL_MS, 30000);
  const blockPageUrl = env.BLOCK_PAGE_URL || deriveBlockPageUrl(apiBase);

  fs.writeFileSync(
    configPath,
    buildConfigJs({ apiBase, cacheTtlMs, heartbeatIntervalMs, blockPageUrl }),
    "utf8"
  );

  const templateText = fs.readFileSync(manifestTemplatePath, "utf8");
  fs.writeFileSync(manifestPath, buildManifest(templateText, clientId), "utf8");

  console.log("config.js generated");
  console.log("manifest.json generated");
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
