import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const functionsRoot = resolve(here, "..");
const repoRoot = resolve(functionsRoot, "..");

await mkdir(resolve(functionsRoot, "lib/templates"), { recursive: true });
await mkdir(resolve(functionsRoot, "lib/content"), { recursive: true });
await cp(resolve(functionsRoot, "src/templates"), resolve(functionsRoot, "lib/templates"), {
  recursive: true,
});
await cp(
  resolve(repoRoot, "site/content/manafest.json"),
  resolve(functionsRoot, "lib/content/manafest.json"),
);
