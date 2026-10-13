import test from "node:test";
import assert from "node:assert/strict";
import {
  createExperiment,
  createIteration,
  weightedScore,
  validateRubric,
  validateScores,
  localRefinement,
} from "../src/domain.mjs";

test("weighted scores reflect active weights and leave unevaluated runs unscored", () => {
  assert.equal(
    weightedScore({ preservation: 100, transformation: 50, quality: 80 }),
    78,
  );
  assert.equal(
    weightedScore({ preservation: 100, transformation: null, quality: 80 }),
    null,
  );
  assert.equal(
    weightedScore({ preservation: 100, transformation: null, quality: null }, [
      { id: "preservation", weight: 100 },
      { id: "transformation", weight: 0 },
      { id: "quality", weight: 0 },
    ]),
    100,
  );
});
test("score and rubric validation reject misleading values", () => {
  assert.throws(() =>
    validateScores({ preservation: 101, transformation: 20, quality: 20 }),
  );
  assert.throws(() =>
    validateScores({ preservation: "80", transformation: 20, quality: 20 }),
  );
  assert.throws(() =>
    validateRubric([
      { id: "preservation", weight: 0 },
      { id: "transformation", weight: 0 },
      { id: "quality", weight: 0 },
    ]),
  );
  assert.throws(() =>
    validateRubric([
      { id: "preservation", weight: 50 },
      { id: "preservation", weight: 30 },
      { id: "quality", weight: 20 },
    ]),
  );
});
test("a child iteration does not inherit outputs or scores", () => {
  const iteration = createIteration(
    "Keep the silhouette.",
    "parent-id",
    "Texture study",
  );
  assert.equal(iteration.parentId, "parent-id");
  assert.equal(iteration.output, null);
  assert.deepEqual(Object.values(iteration.scores), [null, null, null]);
});
test("local refinement keeps requirements and feedback without claiming a model call", () => {
  const experiment = createExperiment({
    title: "Vase",
    preserve: "right-side handle",
    transform: "matte clay",
    prompt: "A vase.",
  });
  const result = localRefinement(
    experiment,
    experiment.iterations[0],
    "Retain the orange.",
  );
  assert.match(result.prompt, /right-side handle/);
  assert.match(result.prompt, /matte clay/);
  assert.match(result.prompt, /Retain the orange/);
  assert.equal(result.provider, "local");
});
