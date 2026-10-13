import { randomUUID } from "node:crypto";

export const CRITERIA = ["preservation", "transformation", "quality"];
export const DEFAULT_RUBRIC = [
  { id: "preservation", label: "Preservation", weight: 40 },
  { id: "transformation", label: "Transformation", weight: 35 },
  { id: "quality", label: "Visual quality", weight: 25 },
];
export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function text(value, label, max = 8000, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  ) {
    throw new AppError(
      label +
        " must be " +
        (required ? "nonempty " : "") +
        "text, up to " +
        max +
        " characters.",
    );
  }
  return value.trim();
}
export function validateScores(scores) {
  if (!scores || typeof scores !== "object" || Array.isArray(scores))
    throw new AppError("Scores must be an object.");
  const result = {};
  for (const id of CRITERIA) {
    const value = scores[id];
    if (
      value !== null &&
      (!Number.isInteger(value) || value < 0 || value > 100)
    ) {
      throw new AppError(
        "Each score must be null or a whole number from 0 to 100.",
      );
    }
    result[id] = value;
  }
  return result;
}
export function validateRubric(rubric) {
  if (!Array.isArray(rubric) || rubric.length !== 3)
    throw new AppError("The rubric must contain three criteria.");
  const seen = new Set();
  const result = rubric.map((item) => {
    if (!item || !CRITERIA.includes(item.id) || seen.has(item.id))
      throw new AppError("Each criterion must appear exactly once.");
    seen.add(item.id);
    if (!Number.isFinite(item.weight) || item.weight < 0 || item.weight > 100)
      throw new AppError("Weights must be numbers between 0 and 100.");
    return {
      id: item.id,
      label: DEFAULT_RUBRIC.find((row) => row.id === item.id).label,
      weight: item.weight,
    };
  });
  if (!result.some((item) => item.weight > 0))
    throw new AppError("At least one criterion needs a positive weight.");
  return result;
}
export function weightedScore(scores, rubric = DEFAULT_RUBRIC) {
  const active = rubric.filter((item) => item.weight > 0);
  if (
    !active.length ||
    active.some((item) => !Number.isFinite(scores?.[item.id]))
  )
    return null;
  return Math.round(
    active.reduce((sum, item) => sum + scores[item.id] * item.weight, 0) /
      active.reduce((sum, item) => sum + item.weight, 0),
  );
}
export function createIteration(prompt, parentId = null, branch = "Main") {
  return {
    id: randomUUID(),
    parentId,
    branch: text(branch, "Branch name", 80, true),
    prompt: text(prompt, "Prompt", 16000, true),
    output: null,
    scores: { preservation: null, transformation: null, quality: null },
    scoreSource: null,
    feedback: "",
    evaluation: null,
    generation: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
export function createExperiment(input) {
  return {
    id: randomUUID(),
    title: text(input.title, "Title", 120, true),
    goal: text(input.goal || "", "Goal", 4000),
    preserve: text(input.preserve || "", "Preservation requirements", 4000),
    transform: text(input.transform || "", "Transformation requirements", 4000),
    reference: null,
    rubric: structuredClone(DEFAULT_RUBRIC),
    isExample: false,
    createdAt: new Date().toISOString(),
    iterations: [
      createIteration(
        input.prompt ||
          "Describe the transformation you want, including what must stay the same.",
      ),
    ],
  };
}
export function findExperiment(state, id) {
  const experiment = state.experiments.find((item) => item.id === id);
  if (!experiment) throw new AppError("Experiment not found.", 404);
  return experiment;
}
export function findIteration(experiment, id) {
  const iteration = experiment.iterations.find((item) => item.id === id);
  if (!iteration) throw new AppError("Iteration not found.", 404);
  return iteration;
}
export function localRefinement(experiment, iteration, feedback) {
  const base = iteration.prompt.split("\n\nITERATION CONSTRAINTS")[0].trim();
  const previous = iteration.prompt.includes("\n\nITERATION CONSTRAINTS")
    ? iteration.prompt.split("\n\nITERATION CONSTRAINTS")[1].trim()
    : "";
  const instructions = [
    experiment.preserve && "Preserve: " + experiment.preserve,
    experiment.transform && "Transform: " + experiment.transform,
    "Use the original reference as the source of truth. Change only the requested attributes.",
    previous && "Previous constraints: " + previous,
    feedback && "Address this feedback specifically: " + feedback,
    "Before finishing, verify subject identity, composition, requested style, and visible artifacts.",
  ].filter(Boolean);
  const prompt = base + "\n\nITERATION CONSTRAINTS\n" + instructions.join("\n");
  if (prompt.length > 16000)
    throw new AppError(
      "The refined prompt is too long. Shorten the current prompt or feedback.",
    );
  return {
    prompt,
    provider: "local",
    rationale: "An explicit constraint-based rewrite; no model was called.",
    changes: [
      "Made preservation and transformation requirements explicit.",
      "Added your specific feedback as an instruction.",
      "Added a visual consistency check.",
    ],
  };
}
