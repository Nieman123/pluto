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
await cp(resolve(repoRoot, 'assets/rentals/initial-inventory.json'), resolve(functionsRoot, 'lib/content/initial-inventory.json'));
await cp(resolve(repoRoot, 'site/static/assets/rentals.css'), resolve(functionsRoot, 'lib/templates/rentals.css.njk'));
await cp(
  resolve(repoRoot, "site/static/assets/site.css"),
  resolve(functionsRoot, "lib/templates/site.css.njk"),
);

await cp(resolve(functionsRoot, "src/waiver/legal"), resolve(functionsRoot, "lib/waiver/legal"), { recursive: true });
await cp(resolve(repoRoot, "assets/fonts/Montserrat-Medium.ttf"), resolve(functionsRoot, "lib/waiver/legal/Montserrat-Medium.ttf"));
await cp(resolve(functionsRoot, 'src/ticketing/admission-sw.js'), resolve(functionsRoot, 'lib/ticketing/admission-sw.js'));
