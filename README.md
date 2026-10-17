# MekaScope

A human-reviewed bicycle diagnosis workflow powered by FastAPI, PostgreSQL, and Gemini. Users supply a photo and symptoms, review possible causes, perform guided checks, and approve an internal service task. Resolution outcomes remain attached to the case. The industrial pump page remains a static preview.

## Local setup

Requirements: uv, Python 3.11+, Node 20.19+ (or Node 22.12+), Docker Compose, and a Gemini API key. The project was verified with Python 3.14 and Node 26.

From the repository root:

```bash
uv sync --project app --locked
cp app/.env.example app/.env
```

Backend dependencies are defined in `app/pyproject.toml` and pinned in `app/uv.lock`. `uv sync` creates and manages `app/.venv` and installs the development group by default. No virtual environment activation is required. Use `uv sync --project app --locked --no-dev` for runtime dependencies only, and add `--no-dev` to runtime `uv run` commands to keep development dependencies excluded.

Set `GEMINI_API_KEY` in `app/.env`. The key stays on the backend. `GEMINI_MODEL` defaults to `gemini-3.6-flash` and can be changed to a model available to your account that supports image input and structured output.

Start PostgreSQL, apply migrations, and run the API:

```bash
docker compose up -d --wait db
uv run --project app --locked python -m alembic -c app/alembic.ini upgrade head
uv run --project app --locked python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal, start the frontend:

```bash
cd web
npm ci --registry=https://registry.npmjs.org
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to `http://127.0.0.1:8000`. To use another backend, set `VITE_API_BASE_URL` in `web/.env` to its full API prefix, for example `http://127.0.0.1:8000/api/v1`, and allow the frontend origin through backend `CORS_ORIGINS`. `VITE_API_PROXY_TARGET` can override the local development proxy target. For a production frontend build, provide a reverse proxy for `/api` or set `VITE_API_BASE_URL` at build time.

The API provides Swagger UI at `http://127.0.0.1:8000/docs` and ReDoc at `/redoc`.

```bash
curl --fail http://127.0.0.1:8000/health
curl --fail http://127.0.0.1:8000/health/ready
```

`/health` reports process liveness. `/health/ready` checks the migrated database; it does not make a paid Gemini request. The catalogue and saved cases remain accessible without a Gemini key; analysis returns an actionable configuration error until a key is configured. PostgreSQL is required for case operations. The Compose database listens on loopback port 5433 and persists data in a named volume. `docker compose stop` preserves that volume.

## Workflow and API

Application routes use `/api/v1`; the complete request and response schemas are documented in `/docs`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/catalog` | Sample bicycle input context and static pump preview |
| POST | `/images/preview` | Convert a photo to a JPEG preview without saving a case |
| POST | `/cases` | Create a case using multipart input |
| GET | `/cases/{id}` | Restore results, evidence, available stages, and task |
| GET | `/cases/{id}/images/{image_id}` | Retrieve a photo belonging to the case |
| POST | `/cases/{id}/scan` | Recognize bicycle components using Gemini |
| POST | `/cases/{id}/investigate` | Rank possible causes and propose inspection checks |
| PUT | `/cases/{id}/verification-steps/{step_id}` | Save check confirmation and optional evidence |
| POST | `/cases/{id}/verify` | Reassess after all checks are confirmed |
| POST | `/cases/{id}/tasks` | Approve and create one internal service task |
| GET | `/tasks` | List approved maintenance tasks with their inspection context |
| PUT | `/tasks/{id}/status` | Move a task to `todo`, `in_progress`, or `done` |
| POST | `/tasks/{id}/resolve` | Record a user-reported resolution |

Case creation accepts `source=sample` or `source=upload`, a required nonblank `symptom`, and optional `configuration` and `service` notes. `upload` requires an `image`; `sample` rejects uploaded images. Notes and symptoms are limited to 4,000 characters. Sample cases include the prepared sample bicycle configuration/history. Custom uploads never inherit that context.

Step updates accept multipart `completed`, optional `observation`, and optional `image`. All checks must be confirmed before reassessment. Observations and photos are optional: a confirmation records that a check was performed, without inventing its outcome. Completed verification freezes its evidence; start a new case to change it. Task creation requires JSON `{"approved":true}`. Resolution accepts JSON `{"notes":"..."}`; notes are optional and limited to 4,000 characters.

Photos may be JPEG, PNG, WebP, or HEIC/HEIF (including 48-megapixel iPhone photos), at most 10 MiB and 64 million pixels. Both the initial upload and follow-up evidence offer file selection and a **Take photo** camera option on supported mobile devices. HEIC/HEIF selections are converted to JPEG for browser previews without creating a case. The server decodes and rotates uploads, strips metadata, resizes to at most 2048×2048, and stores normalized JPEG bytes in PostgreSQL. A multipart request limit also bounds streamed uploads.

Gemini supplies recognition, image annotations, ranked hypotheses, verification checks, and recommendations. Structured results are validated before persistence. Missing records remain unknown, source labels distinguish reports and inferences, and confidence values are model estimates rather than measured probabilities. Inconclusive results can recommend further inspection. Prepared diagnosis results are never used as a fallback for live analysis.

Analysis requests wait for Gemini, with a default 60-second timeout. PostgreSQL operation claims prevent concurrent analysis and expire after 120 seconds to recover interrupted work. Completed operations return their saved result on retry; repeated approval/resolution requests preserve the same task and outcome. Invalid sequencing returns 409, invalid input 422, oversized uploads 413, unsupported formats 415, provider failures 502, unavailable configuration/quota/billing/database 503, and timeouts 504. Failures preserve completed progress. Reloading a pending case polls for its result.

An image upload and its Gemini scan are separate requests. If Gemini reports depleted prepayment credits (upstream HTTP 402), the API returns 503 with an explicit billing message. Restore credits for the API key's project in Google AI Studio, then retry analysis on the saved case; uploading the photo again is unnecessary.

Browser session storage holds only the active case ID and selected stage. PostgreSQL holds the actual case, evidence, task, and outcome. **New case** clears the active view and leaves previous database records intact. Clearing browser storage loses the active-case reference; an existing ID can still be retrieved through the API. A case-history interface is not included.

The **Maintenance board** at `/maintenance` lists approved tasks across inspections. **Approve & create task** in the Act step adds one card to **To do**, with a link to open the board. Existing approved tasks appear automatically. Drag cards or use their status menu to move work through **To do**, **In progress**, and **Done**. Search by task ID, equipment, symptom, or diagnosis, and filter by priority. Open a card for the recommendation, resolution notes, and a link back to its source inspection. Moving a task to **Done** records its resolution on the inspection; resolving it from Act also moves its board card to **Done**. Completed outcomes are final, and retrying completion preserves the original notes. The board persists in PostgreSQL and does not require an active inspection in browser storage.

After updating an existing installation, run `uv run --project app --locked python -m alembic -c app/alembic.ini upgrade head` to add board statuses. Existing open tasks start in **To do**, and tasks with recorded outcomes start in **Done**. Production frontend hosting must serve the SPA entry point for `/maintenance` as well as `/`.

## Verification

Start the Compose database before integration or browser tests. The tests create a uniquely named temporary database, apply the actual Alembic migrations, and drop only that temporary database on teardown. The default administration URL is the local Compose database; override `TEST_DATABASE_URL` if needed. Its role must be allowed to create databases.

```bash
uv run --project app --locked python -m pytest -q
uv run --project app --locked ruff check app
uv run --project app --locked ruff format --check app
cd web
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Backend tests inject a fake Gemini adapter. Browser tests launch a test-only backend on port 8011, Vite on 5177, and a fresh PostgreSQL database. They cover sample/custom inputs, failure/retry, pending-operation refresh, evidence, task approval/resolution, persistent state, and the mobile pump preview. The test-only backend requires `MEKASCOPE_E2E=1` and is never selected by the normal application.

A real Gemini smoke test is opt-in and may incur an API charge:

```bash
RUN_GEMINI_SMOKE=1 uv run --project app --locked python -m pytest app/tests/test_gemini.py -m live -q
```

To manage backend dependencies from the repository root:

```bash
uv add --project app <package>
uv add --project app --dev <development-package>
uv remove --project app <package>
uv lock --project app --upgrade
uv sync --project app --locked
```

Commit both `app/pyproject.toml` and `app/uv.lock` when dependencies change. Run the backend commands above from the repository root; `--project app` selects its dependency environment while keeping repository-relative imports and paths intact. The Playwright backend launcher also uses `uv` and the locked environment.

## Structure and boundaries

- `app/`: FastAPI entrypoint, Pydantic schemas, async database models, Gemini adapter, workflow services, catalogue, migrations, and tests.
- `web/`: React/TypeScript frontend, typed API client, Vite configuration, Playwright tests, and bundled sample photographs.
- `compose.yaml`: persistent local PostgreSQL service.

This is a trusted prototype without login or per-user access restrictions. Service tasks are internal database records and resolutions are user reports. Camera capture, voice input, external maintenance systems, and automated retrieval from case memory are not included. The two bundled photographs were generated for this prototype.
