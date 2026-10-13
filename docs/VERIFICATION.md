# Verification

Verified on 13 October 2026.

## Automated

Eleven tests cover domain scoring, validation, fresh child iterations, local refinement, serialised durable storage, image signature checks, complete upload/evaluation/export lifecycles, and model request contracts.

The model tests use an injected mock transport. No API key or paid request is used.

## Browser

Checked the local app in the desktop and compact layouts:

- The reference and output render without broken images.
- The tested 1440 px desktop and 360 px compact layouts have no horizontal overflow.
- Local feedback refinement creates a reviewable suggestion.
- Applying a suggestion creates an empty, unscored child iteration.
- A result upload becomes associated with that iteration’s prompt.
- Manual sliders save criterion scores and calculate the weighted total.
- An alternative named branch can be created from an earlier version.
- A refined iteration stays selected after reloading.
- Side-by-side and overlay modes are available for completed image pairs.
- Browser logs reported no errors during the checks.

## Limits

Live image generation, vision evaluation, and model refinement require a configured OpenAI account and were not run here because no API key was available. Their request construction and error handling were tested with mocks.

The GitHub checks workflow runs syntax checks and tests on pushes and pull requests. Its current results are available in [GitHub Actions](https://github.com/dannkis/iter-prompt/actions). The verification recorded above comes from the local run.
