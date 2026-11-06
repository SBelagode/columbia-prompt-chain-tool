# Columbia Prompt Chain Tool

A superadmin tool for managing prompt chains and running them on images. It shares a Supabase project with the Columbia consumer and admin apps.

## Features

- Create, edit and delete prompt chains and their steps
- Reorder steps
- Run a chain on an image, text or both, with live progress, and save the result as a generation
- See each chain's run history on its page: image, output, status and every step's response
- Light, dark and system themes, chosen from the top navigation

## Setup

Create `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
GEMINI_API_KEY=
```

No service-role key or Google client secret is used.

Apply these in the Supabase SQL editor:

1. `20261026_consumer_generation_logging.sql`, from the consumer app
2. `supabase/migrations/20261106_prompt_chain_tool_writes.sql`, from this repo
3. `supabase/migrations/20261107_harden_step_reorder.sql`, from this repo

Add this app's origin and its `/auth/callback` URL to the Google OAuth client, then run:

```bash
npm install
npm run dev
```

Tailwind is pinned to 4.3.3 because later versions need Node 20.19 or newer. The pin can be removed once the project runs on Node 22.

## Access control

Only users with `profiles.is_superadmin = true` can use the tool:

1. `proxy.ts` routes every request by access level. New routes are protected by default.
2. `requireSuperadmin()` in `lib/auth.ts` runs in every page and Server Action.
3. RLS has the final say, because all database access uses the signed-in user's JWT.

## How a run works

`/chains/[id]/run` posts to a streaming Route Handler, which reports each step as it starts and finishes. `lib/chain-runner.ts` checks every step, uploads any image, and creates a `generation_requests` row. It then calls Gemini one step at a time, in `step_order`, and logs each call to `llm_responses`.

Each step receives its stored prompt plus its input: the user's text for the first step, and the previous step's output after that. The image goes to the first step whose model supports images, and to any later step whose prompt mentions an image.

The last output is saved to `generations`, so it appears on the consumer app's public feed. If a step fails, the run stops and the request is marked failed or blocked. The upload stays, so the request keeps its link to the image.

Runs are logged in the shared schema: one `generation_requests` row per run and one `llm_responses` row per executed step. Logging is required, not best effort. If a step can't be logged, the run stops before publishing anything.

A step uses its assigned model, or the default Gemini model if it has none. Only Gemini models can run.

## The default chain

The consumer app looks up `default-columbia-image-caption` by slug, so that chain can't be deleted. Slugs are set once at creation, so its slug can't change either. Its name, description and steps can be edited, but that doesn't change consumer captions, which use a prompt hardcoded in that app.
