// deno-lint-ignore-file no-import-prefix

// run with:
// deno run --env --allow-all .\pushNewVersion.ts

import { bundle } from "jsr:@deno/emit@0.46.0";
import Cloudflare, { toFile } from "npm:cloudflare@6.1.0";

import { join, toFileUrl } from "jsr:@std/path@0.223";

const accountId = Deno.env.get("CF_ACCOUNT_ID");
if (!accountId) throw new Error("CF_ACCOUNT_ID env var is not set!");

const apiToken = Deno.env.get("KEY");
if (!apiToken) throw new Error("KEY env var is not set!");

const env = JSON.parse(await Deno.readTextFile("var.json")) as Record<
  string,
  unknown
>;

console.log("using the following:", JSON.stringify(env, null, 2));
if (!confirm("Continue with this operation?")) Deno.exit(1);

validateEnvVars(env);
await validateVersionExists(env);

const client = new Cloudflare({ apiToken });

const existing = await client.workers.scripts.scriptAndVersionSettings.get(
  "host-crx-worker",
  { account_id: accountId },
);
const existingBindings = existing.bindings as
  | Array<{ name: string; text?: string }>
  | undefined;

const existingVersionBinding = existingBindings?.find(
  (b) => b.name === "VERSION",
);
if (existingVersionBinding?.text === env.VERSION) {
  console.log(
    `Version ${env.VERSION} is already currently deployed, skipping.`,
  );
  Deno.exit(0);
}

const existingBindingNames = new Set(
  existingBindings?.map((b) => b.name) ?? [],
);

const bindings = [plainText("VERSION", env.VERSION as string)];

for (const name of ["EXTENSION_ID", "R2_URL"] as const) {
  if (!existingBindingNames.has(name)) {
    bindings.push(plainText(name, env[name] as string));
  } else {
    console.log(`${name} binding already exists, skipping.`);
  }
}

const { code } = await bundle(
  toFileUrl(join(Deno.cwd(), "src", "index.ts")),
);

const response = await client.workers.scripts.versions.create(
  "host-crx-worker",
  {
    account_id: accountId,
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

function plainText(name: string, text: string) {
  return { type: "plain_text" as const, name, text };
}

function validateEnvVars(env: Record<string, unknown>): void {
  for (const key of ["VERSION", "EXTENSION_ID", "R2_URL"] as const) {
    if (typeof env[key] !== "string") {
      throw new Error(`Missing or invalid ${key}`);
    }
  }
}

async function validateVersionExists(
  env: Record<string, unknown>,
): Promise<void> {
  const r = await fetch(
    `${env.R2_URL as string}/${env.VERSION as string}.crx`,
    {
      method: "HEAD",
    },
  );
  if (r.status !== 200) {
    throw new Error("could not find crx with that version.");
  }
}
