# Search images by faces

Find every photo of a person in a public Google Drive folder. Upload a photo of their face (or take one with the camera), paste the folder link, and the app lists the photos that match. You can download all matches as a zip.

Face detection and matching run in the browser with [face-api.js](https://github.com/justadudewhohacks/face-api.js), using the models in `public/models`. Photos are downloaded from Drive through the app's own API routes, so the Google API key stays on the server.

## Setup

1. Install dependencies with [pnpm](https://pnpm.io) 8 (the version is pinned in `package.json`):

   ```bash
   pnpm install
   ```

2. Create a Google API key with the **Google Drive API** enabled ([Google Cloud console](https://console.cloud.google.com/apis/credentials)).

3. Copy `env.sample` to `.env.local` and fill it in:

   | Variable | Required | Description |
   | --- | --- | --- |
   | `GOOGLE_API_KEY` | Yes | Google API key used by the server to read public Drive folders. |
   | `NEXT_PUBLIC_FACE_MATCHER_THRESHOLD` | No | How close a face must be to count as a match, from 0 to 1. Lower is stricter. Defaults to `0.5`. |
   | `NEXT_PUBLIC_MIN_CONFIDENCE` | No | Minimum confidence for a face to be detected in a photo, from 0 to 1. Defaults to `0.3`. |

4. Start the dev server and open [http://localhost:3000](http://localhost:3000):

   ```bash
   pnpm dev
   ```

The Drive folder must be shared as "Anyone with the link". Photos are checked from 1600px thumbnails, 4 at a time, which keeps large folders within Google Drive's limits; only matching photos are downloaded at full size. If Drive still rate limits the app, the scan pauses and retries.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the dev server. |
| `pnpm build` | Build for production. |
| `pnpm start` | Serve the production build. |
| `pnpm lint` | Run ESLint. |
| `pnpm test` | Run the Jest tests. |

CI runs lint, tests and build on every pull request (`.github/workflows/ci.yml`).
