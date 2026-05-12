// deno-lint-ignore-file no-import-prefix

// run with:
// deno run --env --allow-all .\pushNewVersion.ts

import { bundle } from "jsr:@deno/emit@0.46.0";
import Cloudflare, { toFile } from "npm:cloudflare@6.1.0";
import type { ScriptAndVersionSettingGetResponse } from "npm:cloudflare@6.1.0/resources/workers/scripts/script-and-version-settings";

import { join, toFileUrl } from "jsr:@std/path@0.223";

// implicit error handling
// we just panic if something goes wrong
for (const type of ["unhandledrejection", "error"]) {
  globalThis.addEventListener(type, (e) => {
    console.error("Exiting... Unhandled:", e);
    Deno.exit(1);
  });
}

type Config = {
  EXTENSION_ID: string;
  VERSION: string;
  CF_ACCOUNT_ID?: string;
  R2_URL?: string;
};

const ghResult = await new Deno.Command("gh", {
  args: [
    "api",
    "repos/eissar/gaafl/contents/gaafl.json",
    "--jq",
    ".content",
  ],
  stdout: "piped",
  stderr: "inherit",
}).output();

if (!ghResult.success) {
  console.error(`gh api failed, exit code: ${ghResult.code}`);
  Deno.exit(1);
}

// may throw
const rawConfig = JSON.parse(
  atob(new TextDecoder().decode(ghResult.stdout).trim()),
);

// Map keys to match Config type
const cfg: Config = {
  EXTENSION_ID: rawConfig.extensionid,
  VERSION: rawConfig.version,
  CF_ACCOUNT_ID: Deno.env.get("CF_ACCOUNT_ID"),
  R2_URL: Deno.env.get("R2_URL"),
};
const crxURL = `${cfg.R2_URL}/${cfg.VERSION}.crx`;

// Validate all required configuration values
for (const [key, value] of Object.entries(cfg)) {
  if (!value) {
    throw new Error(`Missing configuration value for ${key}`);
  }
}

console.log("using the following:", JSON.stringify(cfg, null, 2));
if (!confirm("Continue with this operation?")) Deno.exit(1);

const crxExistsResponse = await fetch(crxURL, { method: "HEAD" });
if (!crxExistsResponse.ok) {
  throw new Error(
    `version ${cfg.VERSION} not yet uploaded this to the bucket at url: ${crxURL}`,
  );
}

if (!Deno.env.has("KEY")) throw new Error("missing env var KEY");
const client = new Cloudflare({ apiToken: Deno.env.get("KEY") });

const existing = await client.workers.scripts.scriptAndVersionSettings.get(
  "host-crx-worker",
  { account_id: cfg.CF_ACCOUNT_ID! },
);

const existingBindings = (existing.bindings || []).filter((b) =>
  b.type === "plain_text"
) as ScriptAndVersionSettingGetResponse.WorkersBindingKindPlainText[];

const existingVersionBinding = existingBindings?.find(
  (b) => b.name === "VERSION",
);

if (existingVersionBinding?.text === cfg.VERSION) {
  if (
    !confirm(`Version ${cfg.VERSION} is already currently deployed, continue?`)
  ) Deno.exit(0);
}

const bindings = [
  plainText("VERSION", cfg.VERSION),
  plainText("EXTENSION_ID", cfg.EXTENSION_ID),
  plainText("R2_URL", cfg.R2_URL!),
];

const { code } = await bundle(
  toFileUrl(join(Deno.cwd(), "src", "index.ts")),
);

const response = await client.workers.scripts.versions.create(
  "host-crx-worker",
  {
    account_id: cfg.CF_ACCOUNT_ID!,
    files: [
      await toFile(
        new TextEncoder().encode(code),
        "worker.js",
        { type: "application/javascript+module" },
      ),
    ],
    metadata: {
      main_module: "worker.js",
      bindings,
    },
  },
);

console.log("✅ Worker deployed successfully");
console.log(JSON.stringify(response, null, 2));

function plainText(
  name: string,
  text: string,
): ScriptAndVersionSettingGetResponse.WorkersBindingKindPlainText {
  return { type: "plain_text", name, text };
}
