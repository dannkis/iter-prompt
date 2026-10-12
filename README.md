# Iter Prompt

A local workspace for improving visual prompts. Compare a reference with its outputs, score what was preserved and what changed, and turn specific feedback into the next iteration.

**History provenance:** This project was created on 13 October 2026. May–October commit dates are assigned retrospectively to illustrate development milestones. They do not record when the work actually happened.

## Direction

- Keep the original reference visible throughout an experiment.
- Version prompts and outputs together; a new iteration starts without inherited scores.
- Score preservation, transformation, and visual quality separately.
- Refine prompts using feedback and optional model assistance.
- Keep project data on the local machine and API credentials on the server.

This is an independent project. It contains no employer code or internal data.

## Start locally

Requires Node.js 22.12 or newer. There are **no runtime dependencies** and no build step.

```sh
npm start
```

Open **http://127.0.0.1:4317**. For automatic server restarts while developing, use `npm run dev`.

The first launch includes an example still life. Its images are authored illustration fixtures and its scores are illustrative, not model-generated evidence.

## The workflow

1. Create an experiment and describe its goal, what to preserve, and what to transform.
2. Upload a reference image (PNG, JPEG, or WebP; up to 12 MB).
3. Edit and save the draft prompt. Generate an output with OpenAI or upload a result from another tool.
4. Compare the reference and output side by side or with the overlay slider.
5. Score preservation, transformation, and visual quality manually, or request an AI estimate.
6. Write specific feedback. Local rules assemble explicit constraints; OpenAI can analyse the images and propose a revision.
7. Review the suggestion and apply it as a new iteration. Alternatively, branch from any existing version to explore another direction.

Completed prompts, outputs, and the original brief stay together. A child iteration starts unscored with no output. Weights can change at any time; totals are normalised and recalculated from the stored criterion scores.

An exported experiment includes its prompts, scores, notes, branch relationships, and embedded image data in one JSON file. Export is currently one-way; importing archives is planned.

## Enable model assistance

```sh
cp .env.example .env
```

Add your own `OPENAI_API_KEY` to `.env` and restart the server. Model names can be configured through `OPENAI_TEXT_MODEL` and `OPENAI_IMAGE_MODEL`. The defaults are `gpt-6-astra` for prompt refinement and vision evaluation and `gpt-image-2` for image editing; account access varies.

The key stays on the local server. It is never sent to the browser, written into exports, or committed. Model actions send the selected brief, prompt, feedback, and relevant images to OpenAI and can incur API charges. Calls are initiated explicitly; the app does not retry paid requests automatically.

Text calls use the [Responses API](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) with strict structured output and `store: false`. Image transformations use the [image edits API](https://developers.openai.com/api/reference/resources/images/methods/edit) against the original reference on every iteration.

Model scores are subjective estimates. They are labelled separately from human scores; editing the sliders and saving replaces the active scores with your manual assessment. Model notes remain available.

## Local data

The server listens on the loopback interface. This is a single-user local tool, not a hosted multi-user service.

- `.data/workspace.json` stores experiments and iteration history.
- `.data/assets/` stores uploaded and generated images.
- Both `.data/` and `.env` are excluded from Git.
- Set `ITER_DATA_DIR` to relocate the workspace.
- Back up the whole `.data` folder to preserve your projects and their images.

Writes are serialised and committed through an atomic rename. A failed mutation leaves the previous workspace intact.

## Development and checks

```sh
npm run check
npm test
```

Tests cover weighted scoring, iteration isolation, durable storage, upload checks, immutable output snapshots, portable exports, and model request contracts. Provider tests use mocks and do not require a key or make paid calls. Live account access and model quality need separate verification with your configured account.

See [architecture](docs/ARCHITECTURE.md), [evaluation guidance](docs/EVALUATION.md), and the [retrospective history](docs/HISTORY.md).
