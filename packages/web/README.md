# web

Unified server — serves the Hono API under `/api` and the React frontend from one process.

## Run

```bash
bun run dev
```

The development server port is configured automatically. For a Node.js production host, use Node.js 22.12 or newer, run `npm run build` and `npm run start`, and configure the app's environment variables.

## Typecheck and build

```bash
bun run typecheck
bun run build
```

## Hostinger and Tigris photo storage

This package uses the AWS S3 SDK already in its dependencies to connect to Tigris's S3-compatible API; a separate Tigris SDK is not required. Create a private bucket and an access key with object read/write permissions in the Tigris console, then configure these variables in the Node.js app:

```text
S3_ENDPOINT=https://t3.storage.dev
S3_BUCKET=<bucket-name>
S3_ACCESS_KEY_ID=<access-key>
S3_SECRET_ACCESS_KEY=<secret-key>
```

Uploaded photos remain private in Tigris. The app serves them through `/api/photos/...`, so the bucket does not need public access or browser-side CORS. Keep credentials server-side and never commit them. The API reports a configuration error until all required storage variables are set.

For a subdomain deployment, set `WEBSITE_URL` and `SITE_URL` to the test subdomain, and set `VITE_SITE_URL` to the same URL when building the frontend. Use a separate test database and sandbox payment credentials.
