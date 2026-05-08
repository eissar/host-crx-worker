import type { ExportedHandler } from "@cloudflare/workers-types";

interface Env {
  EXTENSION_ID: string;
  VERSION: string;
  R2_URL: string; // no trailing slash
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/updates.xml") {
      const xml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${env.EXTENSION_ID}'>
    <updatecheck codebase='${env.R2_URL}/${env.VERSION}.crx' version='${env.VERSION}' />
  </app>
</gupdate>`;
      return Promise.resolve(
        new Response(xml, {
          headers: { "Content-Type": "application/xml" },
        }),
      );
    }
    return Promise.resolve(new Response("Not Found", { status: 404 }));
  },
} satisfies ExportedHandler<Env>;
