import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const requestedUrl = process.env.CAPACITOR_PREVIEW_URL || "https://fitmindclub.com.br";
let previewUrl;

try {
  const parsed = new URL(requestedUrl);
  if (parsed.protocol !== "https:") throw new Error("somente HTTPS é aceito");
  previewUrl = parsed.origin;
} catch (error) {
  console.error(`[cap-preview] URL inválida: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const capacitorCli = join(root, "node_modules", "@capacitor", "cli", "bin", "capacitor");
const result = spawnSync(process.execPath, [capacitorCli, "sync", "android"], {
  stdio: "inherit",
  env: { ...process.env, CAPACITOR_SERVER_URL: previewUrl },
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`[cap-preview] Android sincronizado com ${previewUrl}`);
