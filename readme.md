note: you will need to create:
- var.json
- .env
(see secrets manager)

you can test with
```env
# .dev.vars
# gitignore this
EXTENSION_ID=your-id
VERSION=1.0.0
EXT_BINARY_R2=https://your-domain.com/ext.crx
```

then:
wrangler dev

wrangler deploy when ready

deploy.ts to create a new version

--

> wrangler r2 bucket create crx-bin


todo:
https://dash.cloudflare.com/CF_ACCOUNT_ID/workers/services/view/host-crx-worker/production/deployments
wrangler promote <version>


To access your new R2 Bucket in your Worker, add the following snippet to your configuration file:
```toml
[[r2_buckets]]
bucket_name = "crx-bin"
binding = "crx_bin"
```
