const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const paths = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
  spark:
    '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z"/><path d="m20 2 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z"/>',
  branch:
    '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 7v10M18 7v2c0 5-12 3-12 8"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
  zoom: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  leaf: '<path d="M5 19C0 7 10 3 21 3c0 11-4 20-16 16Zm0 0L16 8"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
};
const icon = (name) =>
  '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  (paths[name] || paths.image) +
  "</svg>";
const descriptions = {
  preservation: "Subject, composition, and required details.",
  transformation: "How closely the requested change is achieved.",
  quality: "Finish, consistency, and visible artifacts.",
};
let workspace, config, experimentId, iterationId;
let compareMode = "side",
  suggestion = null,
  working = "";
let refinementStrategy = "local";
let toastTimer;
const experiment = () =>
  workspace.experiments.find((item) => item.id === experimentId);
const iteration = () =>
  experiment()?.iterations.find((item) => item.id === iterationId);
const total = (scores, rubric) => {
  const active = rubric.filter((item) => item.weight > 0);
  if (!active.length || active.some((item) => scores[item.id] === null))
    return null;
  return Math.round(
    active.reduce((sum, item) => sum + scores[item.id] * item.weight, 0) /
      active.reduce((sum, item) => sum + item.weight, 0),
  );
};
function notify(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = "visible" + (error ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.className = ""), error ? 9000 : 4000);
}
async function api(path, method = "GET", data) {
  const response = await fetch(path, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The operation failed.");
  return result;
}
function select(exp, run) {
  experimentId = exp.id;
  iterationId = run?.id || exp.iterations.at(-1).id;
  suggestion = null;
  localStorage.setItem(
    "iter-prompt-selection",
    JSON.stringify({ experimentId, iterationId }),
  );
}
async function refresh() {
  workspace = await api("/api/workspace");
  const exp = experiment() || workspace.experiments[0];
  if (exp && !iteration()) select(exp);
  render();
}
function button(label, action, symbol = "", extra = "", disabled = false) {
  return (
    '<button class="btn ' +
    extra +
    '" data-action="' +
    action +
    '" ' +
    (disabled || working ? "disabled" : "") +
    ">" +
    (symbol ? icon(symbol) : "") +
    label +
    "</button>"
  );
}
function imageCard(asset, label, role) {
  const canUpload =
    role === "reference"
      ? !experiment().iterations.some((run) => run.output)
      : !iteration().output;
  return (
    '<div class="image-card">' +
    '<span class="image-label ' +
    (role === "output" ? "output" : "") +
    '">' +
    label +
    "</span>" +
    (asset
      ? '<img src="' +
        esc(asset.url) +
        '" alt="' +
        esc(
          role === "reference"
            ? "Original reference image"
            : "Output for the selected prompt iteration",
        ) +
        '">' +
        '<button class="image-zoom" data-action="zoom-' +
        role +
        '" aria-label="Enlarge ' +
        role +
        '">' +
        icon("zoom") +
        "</button>"
      : '<div class="empty-image">' +
        icon("image") +
        "<p>" +
        (role === "reference"
          ? "Start with your reference.<br>PNG, JPEG, or WebP."
          : "Your next result goes here.<br>Generate it or upload an output.") +
        "</p>" +
        button(
          "Upload " + role,
          "upload-" + role,
          "upload",
          "small",
          !canUpload,
        ) +
        "</div>") +
    "</div>"
  );
}
function comparePanel(exp, run, index) {
  const canOverlay = exp.reference && run.output;
  return (
    '<section class="panel"><div class="panel-heading"><h2>' +
    icon("image") +
    'Visual comparison</h2><div class="segmented" aria-label="Comparison mode">' +
    '<button data-action="compare-side" class="' +
    (compareMode === "side" ? "selected" : "") +
    '" aria-pressed="' +
    (compareMode === "side") +
    '">Side by side</button>' +
    '<button data-action="compare-overlay" class="' +
    (compareMode === "overlay" ? "selected" : "") +
    '" ' +
    (!canOverlay ? "disabled" : "") +
    ' aria-pressed="' +
    (compareMode === "overlay") +
    '">Overlay</button></div></div>' +
    (compareMode === "overlay" && canOverlay
      ? '<div class="compare-images overlay"><div class="overlay-frame"><img src="' +
        esc(exp.reference.url) +
        '" alt="Reference image"><div class="overlay-layer"><img src="' +
        esc(run.output.url) +
        '" alt="Output overlay"></div></div><label class="overlay-control">Reference<input type="range" id="overlay-range" min="0" max="100" value="50" aria-label="Reveal reference or output">Output</label></div>'
      : '<div class="compare-images">' +
        imageCard(exp.reference, "Original reference", "reference") +
        imageCard(
          run.output,
          "Iteration " + String(index + 1).padStart(2, "0"),
          "output",
        ) +
        "</div>") +
    '<div class="canvas-foot"><span>' +
    icon("lock") +
    'The original stays your source of truth</span><span class="tag">' +
    (exp.isExample
      ? "ILLUSTRATIVE EXAMPLE"
      : run.generation
        ? "MODEL OUTPUT"
        : "YOUR EXPERIMENT") +
    "</span></div></section>"
  );
}
function scorePanel(exp, run) {
  const score = total(run.scores, exp.rubric);
  const source =
    {
      example: "Illustrative scores",
      manual: "Manual scores",
      ai: "AI estimate",
    }[run.scoreSource] || "Not scored yet";
  return (
    '<section class="panel score-panel"><div class="panel-heading"><div class="score-head"><h2>Evaluation</h2><span class="subtle" id="score-source">' +
    source +
    '</span></div><div class="total-score"><strong id="total-score">' +
    (score ?? "—") +
    "</strong><span>/ 100</span></div></div>" +
    '<div class="score-body">' +
    exp.rubric
      .map(
        (item) =>
          '<div><div class="criterion-top"><span>' +
          esc(item.label) +
          '</span><strong id="score-' +
          item.id +
          '">' +
          (run.scores[item.id] ?? "—") +
          "</strong></div>" +
          '<div class="criterion-description">' +
          descriptions[item.id] +
          '</div><div class="meter"><div class="meter-fill" id="meter-' +
          item.id +
          '" style="width:' +
          (run.scores[item.id] ?? 0) +
          '%"></div></div>' +
          '<input class="score-slider" type="range" min="0" max="100" value="' +
          (run.scores[item.id] ?? 50) +
          '" data-criterion="' +
          item.id +
          '" aria-label="' +
          esc(item.label) +
          ' score" ' +
          (!run.output || working ? "disabled" : "") +
          '><span class="hint">Weight ' +
          Math.round(
            (item.weight /
              exp.rubric.reduce((sum, row) => sum + row.weight, 0)) *
              100,
          ) +
          "%</span></div>",
      )
      .join("") +
    '</div><div class="score-actions"><button class="quiet-button" data-action="rubric">' +
    icon("settings") +
    'Adjust weights</button><div style="display:flex;gap:7px">' +
    button("Save scores", "save-scores", "check", "small", !run.output) +
    button(
      "Evaluate with AI",
      "evaluate",
      "spark",
      "small",
      !run.output || !exp.reference || !config.connected,
    ) +
    "</div></div>" +
    (run.evaluation
      ? '<div class="editor-body"><div class="model-notes"><strong>' +
        esc(run.evaluation.model) +
        " · AI estimate</strong><p>" +
        esc(run.evaluation.summary) +
        "</p>" +
        run.evaluation.observations
          .map(
            (item) =>
              "<p><strong>" +
              esc(item.criterion) +
              ":</strong> " +
              esc(item.note) +
              "</p>",
          )
          .join("") +
        (run.evaluation.suggestions.length
          ? "<p><strong>Suggested next steps</strong></p><ul>" +
            run.evaluation.suggestions
              .map((item) => "<li>" + esc(item) + "</li>")
              .join("") +
            "</ul>" +
            button("Use model feedback", "use-model-feedback", "arrow", "small")
          : "") +
        "</div></div>"
      : "") +
    "</section>"
  );
}
function editorPanel(exp, run, index) {
  return (
    '<section class="panel"><div class="panel-heading"><h2>' +
    icon("branch") +
    'Prompt</h2><span class="version-badge">v' +
    String(index + 1).padStart(2, "0") +
    " · " +
    esc(run.branch) +
    "</span></div>" +
    '<div class="editor-body"><label class="field-label" for="prompt">THE INSTRUCTION <span class="word-count" id="word-count">' +
    run.prompt.split(/\s+/).length +
    " words</span></label>" +
    '<textarea id="prompt" class="prompt-input" maxlength="16000" ' +
    (run.output ? "readonly" : "") +
    ">" +
    esc(run.prompt) +
    "</textarea>" +
    (run.output
      ? '<div class="brief-lock">' +
        icon("lock") +
        " Saved with this output. Branch to edit.</div>"
      : '<div class="brief-lock" id="draft-status">Draft · no output yet</div>') +
    '<div class="constraint-row"><span class="constraint-label">' +
    icon("lock") +
    "Preserve</span><p>" +
    esc(exp.preserve || "Add preservation requirements in the brief.") +
    "</p></div>" +
    '<div class="constraint-row"><span class="constraint-label">' +
    icon("spark") +
    "Transform</span><p>" +
    esc(
      exp.transform || "Describe the requested transformation in the brief.",
    ) +
    "</p></div>" +
    '<div class="editor-actions">' +
    (run.output
      ? button("Next iteration", "new-iteration", "branch", "primary wide")
      : button("Save draft", "save-draft", "check", "") +
        button("Upload output", "upload-output", "upload", "") +
        button(
          "Generate output",
          "generate",
          "spark",
          "primary wide",
          !exp.reference || !config.connected,
        )) +
    "</div>" +
    (!config.connected && !run.output
      ? '<p class="hint">Upload results from any tool, or connect OpenAI in settings to generate here.</p>'
      : "") +
    "</div></section>"
  );
}
function feedbackPanel(run) {
  return (
    '<section class="panel feedback-panel"><div class="panel-heading"><h2>' +
    icon("spark") +
    'Make the next one better</h2></div><div class="editor-body">' +
    '<label for="feedback" class="field-label">WHAT SHOULD CHANGE?</label><textarea id="feedback" class="feedback-input" maxlength="8000" placeholder="Be specific: the handle drifted, the texture is too smooth…">' +
    esc(run.feedback) +
    "</textarea>" +
    '<div class="refine-options"><select id="refinement-strategy" aria-label="Refinement provider"><option value="local" ' +
    (refinementStrategy === "local" ? "selected" : "") +
    '>Local rules</option><option value="openai" ' +
    (!config.connected
      ? "disabled"
      : refinementStrategy === "openai"
        ? "selected"
        : "") +
    ">OpenAI</option></select>" +
    button("Refine prompt", "refine", "spark", "lime") +
    '</div><p class="hint" style="margin-bottom:0">Local rules assemble your constraints. OpenAI can analyse the images and feedback.</p>' +
    (working
      ? '<div class="busy-indicator" role="status"><span class="spinner"></span>' +
        esc(working) +
        "</div>"
      : "") +
    (suggestion
      ? '<div class="suggestion"><div class="field-label">SUGGESTED REVISION <span class="word-count">' +
        esc(
          suggestion.provider === "local" ? "Local rules" : suggestion.model,
        ) +
        "</span></div>" +
        '<textarea id="suggested-prompt" maxlength="16000" aria-label="Suggested prompt">' +
        esc(suggestion.prompt) +
        "</textarea><ul>" +
        suggestion.changes
          .map((item) => "<li>" + esc(item) + "</li>")
          .join("") +
        "</ul>" +
        button(
          "Use as next iteration",
          "apply-suggestion",
          "arrow",
          "primary",
        ) +
        '<p class="hint">' +
        esc(suggestion.rationale) +
        "</p></div>"
      : "") +
    "</div></section>"
  );
}
function render() {
  const exp = experiment(),
    run = iteration();
  if (!exp || !run) return;
  const index = exp.iterations.findIndex((item) => item.id === run.id);
  const scores = exp.iterations
    .map((item) => total(item.scores, exp.rubric))
    .filter((value) => value !== null);
  const best = scores.length ? Math.max(...scores) : null;
  $("#app").innerHTML =
    '<div class="layout"><aside class="sidebar"><div class="brand"><div class="brand-mark">' +
    icon("grid") +
    "</div><div>iter<span> / prompt</span></div></div>" +
    '<div><button class="side-link active" data-action="studio">' +
    icon("grid") +
    'Visual studio <span class="count">' +
    workspace.experiments.length +
    "</span></button></div>" +
    '<div><div class="side-heading"><span class="section-label">Experiments</span><button data-action="new-experiment" aria-label="New experiment">' +
    icon("plus") +
    "</button></div>" +
    workspace.experiments
      .map(
        (item) =>
          '<button class="side-link ' +
          (item.id === exp.id ? "active" : "") +
          '" data-experiment="' +
          esc(item.id) +
          '">' +
          icon("image") +
          '<span class="experiment-name">' +
          esc(item.title) +
          "</span></button>",
      )
      .join("") +
    "</div>" +
    '<div class="side-foot"><div class="connection"><span class="dot"></span>' +
    (config.connected ? "OpenAI connected" : "Local workspace") +
    '</div><button data-action="settings">' +
    icon("settings") +
    'Model settings</button><p class="hint">Small changes.<br>Better outcomes.</p></div></aside>' +
    '<main class="main"><header class="topbar"><div class="breadcrumb">Workspace <span>/</span> <strong>Visual studio</strong></div><div class="top-actions"><button class="quiet-button" data-action="export">' +
    icon("download") +
    'Export</button><button class="quiet-button" data-action="settings" aria-label="Model settings">' +
    icon("settings") +
    '</button><span class="avatar" title="Local workspace">DZ</span></div></header>' +
    '<div class="content"><div class="page-heading"><div><div class="eyebrow"><span class="dot"></span> THE ITERATION WORKSPACE</div><h1>' +
    esc(exp.title) +
    "</h1><p>" +
    esc(exp.goal || "Compare, evaluate, and refine your visual prompts.") +
    "</p></div>" +
    button("New experiment", "new-experiment", "plus", "") +
    '</div><div class="workspace-grid"><div>' +
    comparePanel(exp, run, index) +
    scorePanel(exp, run) +
    '<section class="history"><div class="history-title"><h2>Iteration history <span class="subtle">' +
    exp.iterations.length +
    " versions · " +
    new Set(exp.iterations.map((item) => item.branch)).size +
    " branch" +
    (new Set(exp.iterations.map((item) => item.branch)).size === 1
      ? ""
      : "es") +
    '</span></h2><button class="quiet-button" data-action="new-iteration">' +
    icon("branch") +
    "Branch from v" +
    String(index + 1).padStart(2, "0") +
    '</button></div><div class="iteration-grid">' +
    exp.iterations
      .map((item, number) => {
        const score = total(item.scores, exp.rubric);
        return (
          '<button class="iteration-card ' +
          (item.id === run.id ? "selected" : "") +
          '" data-iteration="' +
          esc(item.id) +
          '" aria-pressed="' +
          (item.id === run.id) +
          '">' +
          (item.output
            ? '<img src="' + esc(item.output.url) + '" alt="">'
            : '<div class="iteration-placeholder">' +
              icon("branch") +
              "</div>") +
          '<div class="iteration-detail"><div class="line"><span>v' +
          String(number + 1).padStart(2, "0") +
          "</span>" +
          (score !== null && score === best
            ? '<span class="pill">BEST</span>'
            : "") +
          "<strong>" +
          (score ?? "—") +
          "</strong></div>" +
          "<p>" +
          esc(item.branch) +
          (item.parentId
            ? " · from v" +
              String(
                exp.iterations.findIndex(
                  (parent) => parent.id === item.parentId,
                ) + 1,
              ).padStart(2, "0")
            : " · original prompt") +
          "</p><p>" +
          (item.output
            ? {
                ai: "AI estimate",
                manual: "Manual scores",
                example: "Illustrative example",
              }[item.scoreSource] || "Awaiting evaluation"
            : "Draft · awaiting output") +
          "</p></div></button>"
        );
      })
      .join("") +
    '</div></section></div><div class="right-stack">' +
    editorPanel(exp, run, index) +
    feedbackPanel(run) +
    '</div></div><footer class="page-footer"><span>' +
    icon("lock") +
    (exp.isExample
      ? "Example illustrations and scores. Create an experiment for your own work."
      : "Saved locally on this device.") +
    '</span><button class="quiet-button" data-action="brief">View experiment brief ' +
    icon("arrow") +
    "</button></footer></div></main></div>";
}
async function syncInputs() {
  const exp = experiment(),
    run = iteration(),
    changes = {};
  if (!run.output && $("#prompt")?.value.trim() !== run.prompt)
    changes.prompt = $("#prompt").value;
  if ($("#feedback") && $("#feedback").value.trim() !== run.feedback)
    changes.feedback = $("#feedback").value;
  if ($(".score-slider[data-dirty]")) changes.scores = readScores();
  if (Object.keys(changes).length) {
    const updated = await api(
      "/api/experiments/" + exp.id + "/iterations/" + run.id,
      "PATCH",
      changes,
    );
    Object.assign(run, updated);
  }
}
function readScores() {
  return Object.fromEntries(
    [...document.querySelectorAll(".score-slider")].map((input) => [
      input.dataset.criterion,
      Number(input.value),
    ]),
  );
}
async function task(label, callback) {
  if (working) return;
  let redraw = false;
  try {
    await syncInputs();
    working = label;
    redraw = true;
    render();
    await callback();
    working = "";
    await refresh();
  } catch (error) {
    working = "";
    if (redraw) render();
    notify(error.message, true);
  }
}
function modal(title, content, actions = "") {
  const element = $("#modal");
  element.className = "";
  element.innerHTML =
    '<div class="modal-heading"><h2>' +
    title +
    '</h2><button class="modal-close" data-action="close-modal" aria-label="Close dialog">' +
    icon("close") +
    "</button></div>" +
    content +
    actions;
  element.showModal();
}
function newExperimentModal() {
  modal(
    "Start an experiment",
    '<form id="experiment-form"><div class="form-field"><label for="experiment-title">Name</label><input id="experiment-title" name="title" required maxlength="120" placeholder="e.g. Portrait → paper cutout"></div>' +
      '<div class="form-field"><label for="experiment-goal">Goal</label><input id="experiment-goal" name="goal" maxlength="4000" placeholder="What does a successful result look like?"></div>' +
      '<div class="form-field"><label for="experiment-preserve">What must stay the same?</label><textarea id="experiment-preserve" name="preserve" maxlength="4000" placeholder="Identity, pose, framing, text, object placement…"></textarea></div>' +
      '<div class="form-field"><label for="experiment-transform">What should change?</label><textarea id="experiment-transform" name="transform" maxlength="4000" placeholder="Style, material, palette, format…"></textarea></div>' +
      '<div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">Create experiment ' +
      icon("arrow") +
      "</button></div></form>",
  );
}
function newIterationModal() {
  const exp = experiment(),
    run = iteration(),
    index = exp.iterations.indexOf(run);
  modal(
    "Branch from v" + String(index + 1).padStart(2, "0"),
    '<form id="iteration-form"><p class="settings-copy">Keep this output and its scores intact. The next iteration starts with a new prompt and an empty output.</p><div class="form-field"><label for="branch-name">Branch name</label><input id="branch-name" name="branch" maxlength="80" required value="' +
      esc(run.branch) +
      '" placeholder="e.g. Texture study"></div>' +
      '<div class="form-field"><label for="branch-prompt">Next prompt</label><textarea id="branch-prompt" name="prompt" required maxlength="16000" style="min-height:150px">' +
      esc(run.prompt) +
      '</textarea></div><div class="modal-actions"><button class="btn primary" type="submit">Create iteration ' +
      icon("arrow") +
      "</button></div></form>",
  );
}
function showSettings() {
  modal(
    "Model connection",
    '<p class="settings-copy">' +
      (config.connected
        ? "OpenAI is connected. Image generation, visual evaluation, and model-assisted refinement are available."
        : "Manual evaluation, uploads, and local refinement work now. To enable OpenAI, create <code>.env</code> in the project folder using <code>.env.example</code>, add <code>OPENAI_API_KEY</code>, then restart the server.") +
      '</p><div class="settings-row"><span>Connection</span><strong>' +
      (config.connected ? "Connected" : "Not configured") +
      '</strong></div><div class="settings-row"><span>Text / vision model</span><strong>' +
      esc(config.textModel) +
      '</strong></div><div class="settings-row"><span>Image model</span><strong>' +
      esc(config.imageModel) +
      "</strong></div>" +
      '<p class="settings-copy">Your API key stays on the local server. Model actions send the selected prompt, brief, feedback, and relevant images to OpenAI. Scores from a model are estimates; you can replace them with your own.</p><p class="hint">This workspace is saved to the project’s .data folder. API keys and local data are excluded from Git.</p>',
    '<div class="modal-actions">' +
      button("Refresh connection", "refresh-config", "check", "primary") +
      "</div>",
  );
}
function briefModal() {
  const exp = experiment(),
    locked = exp.iterations.some((run) => run.output);
  modal(
    "Experiment brief",
    '<form id="brief-form"><div class="form-field"><label>Name</label><input name="title" maxlength="120" required value="' +
      esc(exp.title) +
      '"></div>' +
      ["goal", "preserve", "transform"]
        .map(
          (field) =>
            '<div class="form-field"><label>' +
            { goal: "Goal", preserve: "Preserve", transform: "Transform" }[
              field
            ] +
            '</label><textarea name="' +
            field +
            '" maxlength="4000" ' +
            (locked ? "readonly" : "") +
            ">" +
            esc(exp[field]) +
            "</textarea></div>",
        )
        .join("") +
      (locked
        ? '<p class="hint">The brief and reference are fixed once an output is attached, keeping past scores comparable.</p>'
        : button("Upload reference", "upload-reference", "upload")) +
      '<div class="modal-actions"><button class="btn primary" type="submit">Save brief</button></div></form>',
  );
}
function rubricModal() {
  modal(
    "Set evaluation weights",
    '<form id="rubric-form"><p class="settings-copy">Balance preserving the reference against achieving the transformation. Weights are normalised when calculating the overall score.</p><div class="weight-fields">' +
      experiment()
        .rubric.map(
          (item) =>
            "<label>" +
            esc(item.label) +
            '<input type="number" name="' +
            item.id +
            '" min="0" max="100" step="1" value="' +
            item.weight +
            '" required></label>',
        )
        .join("") +
      '</div><div class="modal-actions"><button class="btn primary" type="submit">Apply weights</button></div></form>',
  );
}
async function upload(role) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp";
  document.body.append(input);
  input.addEventListener("cancel", () => input.remove(), { once: true });
  input.addEventListener(
    "change",
    async () => {
      const file = input.files[0];
      input.remove();
      if (!file) return;
      if (file.size > 12 * 1024 * 1024)
        return notify("Choose an image smaller than 12 MB.", true);
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await task("Saving your image…", async () => {
        await api("/api/upload", "POST", {
          experimentId,
          iterationId,
          role,
          dataUrl,
          name: file.name,
        });
        notify(
          role === "reference"
            ? "Reference added."
            : "Output attached to this prompt.",
        );
      });
    },
    { once: true },
  );
  input.click();
}
const actions = {
  "new-experiment": newExperimentModal,
  "new-iteration": newIterationModal,
  settings: showSettings,
  brief: briefModal,
  rubric: rubricModal,
  studio: () => $("#prompt")?.focus(),
  "close-modal": () => $("#modal").close(),
  "refresh-config": async () => {
    config = await api("/api/config");
    $("#modal").close();
    render();
    notify(
      config.connected ? "OpenAI connected." : "No API key configured yet.",
    );
  },
  "compare-side": () => {
    compareMode = "side";
    render();
  },
  "compare-overlay": () => {
    compareMode = "overlay";
    render();
  },
  "save-draft": () => task("Saving draft…", async () => notify("Draft saved.")),
  "save-scores": () => {
    const scores = readScores();
    return task("Saving scores…", async () => {
      await api(
        "/api/experiments/" + experimentId + "/iterations/" + iterationId,
        "PATCH",
        { scores },
      );
      notify("Manual scores saved.");
    });
  },
  "upload-reference": () => upload("reference"),
  "upload-output": () => upload("output"),
  refine: async () => {
    const feedback = $("#feedback").value,
      strategy = $("#refinement-strategy").value;
    await task("Refining your prompt…", async () => {
      suggestion = await api("/api/refine", "POST", {
        experimentId,
        iterationId,
        feedback,
        strategy,
      });
      notify(
        strategy === "local"
          ? "Local revision ready. Review it before applying."
          : "Model revision ready.",
      );
    });
  },
  "apply-suggestion": async () => {
    const prompt = $("#suggested-prompt").value;
    await task("Creating the next iteration…", async () => {
      const result = await api(
        "/api/experiments/" + experimentId + "/iterations",
        "POST",
        { parentId: iterationId, prompt, branch: iteration().branch },
      );
      experiment().iterations.push(result);
      select(experiment(), result);
      compareMode = "side";
      notify("New iteration created. Its output and scores start empty.");
    });
  },
  "use-model-feedback": () =>
    task("Saving model suggestions…", async () => {
      const feedback = iteration().evaluation.suggestions.join("\n");
      await api(
        "/api/experiments/" + experimentId + "/iterations/" + iterationId,
        "PATCH",
        { feedback },
      );
      notify("Model suggestions added to your feedback.");
    }),
  evaluate: () =>
    task("Comparing the images with your brief…", async () => {
      await api("/api/evaluate", "POST", { experimentId, iterationId });
      notify("AI evaluation saved. Review its estimates.");
    }),
  generate: () =>
    task("Generating your output. This can take a few minutes…", async () => {
      await api("/api/generate", "POST", { experimentId, iterationId });
      notify("Output generated and saved.");
    }),
  export: () =>
    task("Preparing the export…", async () => {
      const data = await api("/api/experiments/" + experimentId + "/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download =
        experiment()
          .title.replace(/[^a-z0-9]+/gi, "-")
          .toLowerCase() + ".json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Experiment exported with its images.");
    }),
};
for (const role of ["reference", "output"])
  actions["zoom-" + role] = () => {
    const asset =
      role === "reference" ? experiment().reference : iteration().output;
    modal(
      role === "reference" ? "Original reference" : "Iteration output",
      '<img src="' + esc(asset.url) + '" alt="' + role + ' image">',
    );
    $("#modal").classList.add("lightbox");
  };
document.addEventListener("click", async (event) => {
  const control = event.target.closest("button");
  if (!control || control.disabled || working) return;
  try {
    if (control.dataset.experiment || control.dataset.iteration) {
      await syncInputs();
      const exp = control.dataset.experiment
        ? workspace.experiments.find(
            (item) => item.id === control.dataset.experiment,
          )
        : experiment();
      select(
        exp,
        control.dataset.iteration
          ? exp.iterations.find((item) => item.id === control.dataset.iteration)
          : null,
      );
      compareMode = "side";
      render();
    } else if (actions[control.dataset.action]) {
      if (
        ![
          "close-modal",
          "save-scores",
          "save-draft",
          "refine",
          "apply-suggestion",
          "generate",
          "evaluate",
          "export",
        ].includes(control.dataset.action)
      )
        await syncInputs();
      await actions[control.dataset.action]();
    }
  } catch (error) {
    notify(error.message, true);
  }
});
document.addEventListener("input", (event) => {
  if (event.target.classList.contains("score-slider")) {
    event.target.dataset.dirty = "true";
    const scores = readScores();
    for (const [id, value] of Object.entries(scores)) {
      $("#score-" + id).textContent = value;
      $("#meter-" + id).style.width = value + "%";
    }
    $("#total-score").textContent = total(scores, experiment().rubric);
    $("#score-source").textContent = "Unsaved manual scores";
  }
  if (event.target.id === "overlay-range")
    $(".overlay-layer").style.clipPath =
      "inset(0 " + (100 - event.target.value) + "% 0 0)";
  if (event.target.id === "prompt") {
    $("#word-count").textContent =
      event.target.value.trim().split(/\s+/).length + " words";
    $("#draft-status").textContent = "Unsaved draft edits";
  }
});
document.addEventListener("change", (event) => {
  if (event.target.id === "refinement-strategy")
    refinementStrategy = event.target.value;
});
document.addEventListener("submit", async (event) => {
  if (
    ![
      "experiment-form",
      "iteration-form",
      "brief-form",
      "rubric-form",
    ].includes(event.target.id)
  )
    return;
  event.preventDefault();
  const form = event.target,
    values = Object.fromEntries(new FormData(form));
  const submit = form.querySelector("[type=submit]");
  submit.disabled = true;
  try {
    await syncInputs();
    if (form.id === "experiment-form") {
      const created = await api("/api/experiments", "POST", {
        ...values,
        prompt:
          "Transform the reference: " +
          (values.transform || values.goal || "describe the desired result") +
          ". Preserve: " +
          (values.preserve || "the source subject and composition") +
          ".",
      });
      workspace.experiments.push(created);
      select(created);
      compareMode = "side";
    } else if (form.id === "iteration-form") {
      const created = await api(
        "/api/experiments/" + experimentId + "/iterations",
        "POST",
        { ...values, parentId: iterationId },
      );
      experiment().iterations.push(created);
      select(experiment(), created);
      compareMode = "side";
    } else if (form.id === "brief-form") {
      const locked = experiment().iterations.some((run) => run.output);
      await api(
        "/api/experiments/" + experimentId,
        "PATCH",
        locked ? { title: values.title } : values,
      );
    } else {
      await api("/api/experiments/" + experimentId, "PATCH", {
        rubric: experiment().rubric.map((item) => ({
          ...item,
          weight: Number(values[item.id]),
        })),
      });
    }
    $("#modal").close();
    await refresh();
    notify("Saved.");
  } catch (error) {
    notify(error.message, true);
    submit.disabled = false;
  }
});
$("#modal").addEventListener("click", (event) => {
  if (event.target === $("#modal")) {
    const box = $("#modal").getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
      $("#modal").close();
  }
});
try {
  [workspace, config] = await Promise.all([
    api("/api/workspace"),
    api("/api/config"),
  ]);
  let previous;
  try {
    previous = JSON.parse(localStorage.getItem("iter-prompt-selection"));
  } catch {}
  const exp =
    workspace.experiments.find((item) => item.id === previous?.experimentId) ||
    workspace.experiments[0];
  select(
    exp,
    exp.iterations.find((item) => item.id === previous?.iterationId),
  );
  render();
} catch (error) {
  $("#app").innerHTML =
    '<main class="error-page"><h1>Your studio could not open</h1><p>' +
    esc(error.message) +
    "</p><p>Restart the local server and refresh this page.</p></main>";
}
