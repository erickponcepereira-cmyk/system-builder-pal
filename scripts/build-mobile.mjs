import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = join(root, "dist");
const staticCandidates = [join(webDir, "client"), join(root, ".output", "public")];
const stagingDir = join(root, "node_modules", ".tmp-capacitor-webdir");
const nativeApiOrigin = process.env.CAPACITOR_API_ORIGIN || "https://fitmindclub.com.br";

function fail(message) {
  console.error(`\n[build-mobile] ${message}\n`);
  process.exit(1);
}

try {
  const parsed = new URL(nativeApiOrigin);
  if (parsed.protocol !== "https:") fail("CAPACITOR_API_ORIGIN deve usar HTTPS.");
} catch {
  fail("CAPACITOR_API_ORIGIN não é uma URL válida.");
}

const viteCli = join(root, "node_modules", "vite", "bin", "vite.js");
const result = spawnSync(process.execPath, [viteCli, "build"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    CAPACITOR_STATIC_BUILD: "true",
    CAPACITOR_SERVER_URL: "",
    VITE_NATIVE_API_ORIGIN: new URL(nativeApiOrigin).origin,
    VITE_NATIVE_APP_VERSION:
      process.env.CAPACITOR_APP_VERSION || "0.1.0-internal.1",
    NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=8192",
  },
});

if (result.error) throw result.error;
if (result.status !== 0) fail(`vite build falhou com código ${result.status}.`);

const staticOutput = staticCandidates.find((directory) => existsSync(directory));
if (!staticOutput) fail(`Saída estática não encontrada em: ${staticCandidates.join(", ")}`);

const shell = join(staticOutput, "index.html");
if (!existsSync(shell)) fail("O build SPA não gerou index.html.");

const shellSize = (await stat(shell)).size;
if (shellSize < 1_000) fail(`index.html parece incompleto (${shellSize} bytes).`);

await rm(stagingDir, { recursive: true, force: true });
try {
  await rename(staticOutput, stagingDir);
} catch {
  await cp(staticOutput, stagingDir, { recursive: true });
}
await rm(webDir, { recursive: true, force: true });
await mkdir(dirname(webDir), { recursive: true });
try {
  await rename(stagingDir, webDir);
} catch {
  await cp(stagingDir, webDir, { recursive: true });
  await rm(stagingDir, { recursive: true, force: true });
}

const entries = await readdir(webDir);
const assetsDirectory = ["assets", "_build"].find((name) => entries.includes(name));
if (!assetsDirectory) fail(`Pasta de assets ausente em dist/: ${entries.join(", ")}`);

const assets = await readdir(join(webDir, assetsDirectory));
const scripts = assets.filter((name) => name.endsWith(".js"));
if (scripts.length === 0) fail(`dist/${assetsDirectory} não contém JavaScript.`);

console.log("\n[build-mobile] Bundle local pronto para o Capacitor:");
console.log(`  API remota: ${new URL(nativeApiOrigin).origin}`);
console.log(`  dist/index.html: ${shellSize} bytes`);
console.log(`  dist/${assetsDirectory}: ${assets.length} arquivos (${scripts.length} JS)`);
