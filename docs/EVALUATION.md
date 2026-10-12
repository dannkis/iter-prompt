# Scoring visual transformations

Keep the evaluation brief specific before producing outputs. A useful brief distinguishes invariants from intended changes: preserve a subject’s pose and composition while changing its material, palette, or rendering style.

## Criteria

| Criterion | What to assess |
| --- | --- |
| Preservation | Subject identity, layout, required details, and the stated invariants |
| Transformation | How effectively the requested changes were applied |
| Visual quality | Visible artifacts, consistency, finish, and legibility where relevant |

Use a 0–100 scale. Zero means failure, 50 indicates partial success, 75 means most requirements are met with clear defects, and 90 indicates success with minor defects. Reserve 100 for results with no visible failures under the stated brief.

The default weights are 40% preservation, 35% transformation, and 25% quality. The overall score is the weighted average, rounded to an integer. Weights do not need to sum to 100 because they are normalised. Zero-weight criteria do not affect the total. A total stays empty until every positively weighted criterion has a score.

Do not penalise preservation for a requested transformation. A cobalt vase becoming terracotta is a success if the colour change is requested; losing its handle is a preservation defect if the handle must remain.

## Feedback that improves prompts

Write a visible defect and the desired correction: “The handle became narrower. Preserve its width and attachment points.” This is more actionable than “Make it better.”

Change one or a few instructions at a time. Branch from a successful iteration when exploring a new direction. Compare outputs under the same reference and brief.

Local refinement is a deterministic instruction assembler. It does not inspect images or infer quality. Model assistance can inspect supplied images, but its grades are subjective and may vary. Neither mode guarantees monotonic improvement.

## Provenance

The included example images are authored fixtures, not outputs of an image model. Their scores are illustrative. User-uploaded outputs are labelled separately from model-generated outputs, and AI score estimates remain distinguishable from manual scores.
