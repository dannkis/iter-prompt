# Architecture

The application is a buildless browser client and a Node.js server using standard library modules. No frontend framework or database service is required.

## Boundaries

- `public/app.js` renders the studio and submits explicit actions.
- `src/domain.mjs` defines experiments, revision relationships, validation, and local prompt refinement.
- `src/store.mjs` serialises changes to a JSON workspace and saves image assets.
- `src/app.mjs` handles HTTP routes and keeps outputs attached to prompt snapshots.
- `src/openai.mjs` isolates model requests behind an injectable transport.
- `src/example.mjs` provides clearly labelled illustration fixtures.

The storage directory is ignored by Git. API credentials are read from server environment variables. The browser receives connection status and model names, never the key.

## Experiment structure

Each experiment has a stable reference, an evaluation brief, a weighted rubric, and an ordered list of iterations. Each iteration records its parent ID and branch name, allowing a tree of alternatives rather than a single overwrite chain.

An iteration with an output is immutable with respect to its prompt and image. Feedback and scores remain editable. Once an experiment has an output, its reference and brief are fixed; a new experiment is required for another evaluation task.

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/workspace` | Read the local workspace |
| `GET /api/config` | Read model availability and names |
| `POST /api/experiments` | Create an experiment |
| `PATCH /api/experiments/:id` | Update its title, draft brief, or weights |
| `POST /api/experiments/:id/iterations` | Branch from an existing iteration |
| `PATCH /api/experiments/:id/iterations/:iterationId` | Save a draft, feedback, or manual scores |
| `POST /api/upload` | Attach a reference or output |
| `POST /api/refine` | Suggest a prompt revision using local rules or OpenAI |
| `POST /api/evaluate` | Request and save an AI estimate |
| `POST /api/generate` | Edit the original reference using the selected draft |
| `GET /api/experiments/:id/export` | Export an experiment with embedded images |

## Tradeoffs and next steps

JSON storage suits a single local user and keeps setup small. Large image archives, multiple users, and long-running background jobs would benefit from a database, resumable jobs, authentication, and object storage.

There is no import flow, automatic batch optimisation, pixel-level objective similarity metric, or cross-model calibration yet. The model adapter is currently OpenAI-specific. These are extension points rather than hidden claims of functionality.
