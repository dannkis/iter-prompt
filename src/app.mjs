import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AppError,
  createExperiment,
  createIteration,
  findExperiment,
  findIteration,
  localRefinement,
  text,
  validateScores,
  validateRubric,
} from "./domain.mjs";

export const publicDirectory = fileURLToPath(
  new URL("../public/", import.meta.url),
);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};
function json(response, data, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}
async function body(request) {
  if (!request.headers["content-type"]?.startsWith("application/json"))
    throw new AppError("Send JSON content.", 415);
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 18 * 1024 * 1024)
      throw new AppError("The request is too large.", 413);
    chunks.push(chunk);
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("The request is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new AppError("The request body must be a JSON object.");
  return parsed;
}
export function createHandler(store, provider = null) {
  const busy = new Set();
  const assetData = async (asset) => {
    if (!asset)
      throw new AppError("Upload a reference and an output image first.");
    let path;
    if (/^\/files\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(asset.url))
      path = join(store.directory, "assets", asset.url.slice(7));
    else if (/^\/demo\/(reference|output-[1-3])\.png$/.test(asset.url))
      path = join(publicDirectory, asset.url.slice(1));
    else throw new AppError("Unsupported image location.");
    const bytes = await readFile(path);
    return (
      "data:" +
      (TYPES[extname(path)] || "image/png") +
      ";base64," +
      bytes.toString("base64")
    );
  };
  return async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
    );
    try {
      const url = new URL(request.url, "http://" + request.headers.host);
      const path = url.pathname;
      if (path.startsWith("/api/")) {
        const host = request.headers.host?.split(":")[0];
        if (!["127.0.0.1", "localhost"].includes(host))
          throw new AppError("This studio accepts local requests only.", 403);
        if (request.headers.origin && request.headers.origin !== url.origin)
          throw new AppError("Cross-origin requests are not allowed.", 403);
        if (path === "/api/health" && request.method === "GET")
          return json(response, { ok: true });
        if (path === "/api/config" && request.method === "GET")
          return json(
            response,
            provider?.config() || {
              connected: false,
              textModel: "Not configured",
              imageModel: "Not configured",
            },
          );
        if (path === "/api/workspace" && request.method === "GET")
          return json(response, await store.read());
        if (path === "/api/experiments" && request.method === "POST") {
          const experiment = createExperiment(await body(request));
          await store.mutate((state) => {
            state.experiments.push(experiment);
            return experiment;
          });
          return json(response, experiment, 201);
        }
        if (
          [
            "/api/upload",
            "/api/refine",
            "/api/evaluate",
            "/api/generate",
          ].includes(path) &&
          request.method === "POST"
        ) {
          const input = await body(request);
          const state = await store.read();
          const experiment = findExperiment(state, input.experimentId);
          const iteration = input.iterationId
            ? findIteration(experiment, input.iterationId)
            : null;
          if (path === "/api/upload") {
            if (!["reference", "output"].includes(input.role))
              throw new AppError("Choose a reference or output image.");
            if (
              input.role === "reference" &&
              experiment.iterations.some((item) => item.output)
            )
              throw new AppError(
                "Create a new experiment to use a different reference.",
                409,
              );
            if (input.role === "output" && (!iteration || iteration.output))
              throw new AppError(
                "Create an empty iteration before attaching another output.",
                409,
              );
            const asset = await store.saveAsset(input.dataUrl, input.name);
            const result = await store.mutate((current) => {
              const target = findExperiment(current, experiment.id);
              if (input.role === "reference") {
                if (target.iterations.some((item) => item.output))
                  throw new AppError(
                    "The reference is locked after an output is attached.",
                    409,
                  );
                target.reference = asset;
              } else {
                const run = findIteration(target, iteration.id);
                if (run.output)
                  throw new AppError(
                    "This iteration already has an output.",
                    409,
                  );
                run.output = asset;
                run.updatedAt = new Date().toISOString();
              }
              return asset;
            });
            return json(response, result, 201);
          }
          if (!iteration) throw new AppError("Select an iteration first.");
          const key = experiment.id + ":" + iteration.id;
          if (busy.has(key))
            throw new AppError(
              "This iteration already has an operation in progress.",
              409,
            );
          busy.add(key);
          try {
            if (path === "/api/refine") {
              const feedback = text(
                input.feedback || iteration.feedback,
                "Feedback",
                8000,
              );
              if (input.strategy === "local")
                return json(
                  response,
                  localRefinement(experiment, iteration, feedback),
                );
              if (input.strategy !== "openai")
                throw new AppError("Choose local or OpenAI refinement.");
              if (!provider?.config().connected)
                throw new AppError(
                  "Add OPENAI_API_KEY to .env and restart the server to use model assistance.",
                  503,
                );
              const images = [];
              if (experiment.reference)
                images.push(await assetData(experiment.reference));
              if (iteration.output)
                images.push(await assetData(iteration.output));
              return json(
                response,
                await provider.refine(experiment, iteration, feedback, images),
              );
            }
            if (!provider?.config().connected)
              throw new AppError(
                "Add OPENAI_API_KEY to .env and restart the server to use model assistance.",
                503,
              );
            if (path === "/api/evaluate") {
              const images = [
                await assetData(experiment.reference),
                await assetData(iteration.output),
              ];
              const evaluation = await provider.evaluate(
                experiment,
                iteration,
                images,
              );
              const result = await store.mutate((current) => {
                const run = findIteration(
                  findExperiment(current, experiment.id),
                  iteration.id,
                );
                run.evaluation = {
                  ...evaluation,
                  createdAt: new Date().toISOString(),
                };
                run.scores = validateScores(evaluation.scores);
                run.scoreSource = "ai";
                return run;
              });
              return json(response, result);
            }
            if (iteration.output)
              throw new AppError(
                "Create a new iteration before generating another output.",
                409,
              );
            const image = await provider.generate(
              iteration.prompt,
              await assetData(experiment.reference),
            );
            const asset = await store.saveAsset(
              image.dataUrl,
              "generated-output.png",
            );
            const result = await store.mutate((current) => {
              const run = findIteration(
                findExperiment(current, experiment.id),
                iteration.id,
              );
              if (run.output || run.prompt !== iteration.prompt)
                throw new AppError(
                  "This iteration changed during generation. Its previous output was kept.",
                  409,
                );
              run.output = asset;
              run.generation = {
                model: image.model,
                createdAt: new Date().toISOString(),
              };
              return run;
            });
            return json(response, result);
          } finally {
            busy.delete(key);
          }
        }
        const match =
          /^\/api\/experiments\/([^/]+)(?:\/(iterations|export)(?:\/([^/]+))?)?$/.exec(
            path,
          );
        if (!match) throw new AppError("Endpoint not found.", 404);
        const [, id, resource, iterationId] = match;
        const state = await store.read();
        const experiment = findExperiment(state, id);
        if (resource === "export" && request.method === "GET") {
          const portable = structuredClone(experiment);
          if (portable.reference)
            portable.reference.dataUrl = await assetData(portable.reference);
          for (const iteration of portable.iterations)
            if (iteration.output)
              iteration.output.dataUrl = await assetData(iteration.output);
          return json(response, {
            format: "iter-prompt-experiment",
            version: 1,
            exportedAt: new Date().toISOString(),
            experiment: portable,
          });
        }
        if (!resource && request.method === "PATCH") {
          const input = await body(request);
          const result = await store.mutate((current) => {
            const target = findExperiment(current, id);
            for (const field of ["title", "goal", "preserve", "transform"])
              if (field in input) {
                if (
                  target.iterations.some((item) => item.output) &&
                  field !== "title"
                )
                  throw new AppError(
                    "Create a new experiment to change the brief after scoring outputs.",
                    409,
                  );
                target[field] = text(
                  input[field],
                  field,
                  field === "title" ? 120 : 4000,
                  field === "title",
                );
              }
            if ("rubric" in input) target.rubric = validateRubric(input.rubric);
            if ("reference" in input) {
              if (target.iterations.some((item) => item.output))
                throw new AppError(
                  "Create a new experiment to change its reference image.",
                  409,
                );
              target.reference = null;
            }
            return target;
          });
          return json(response, result);
        }
        if (
          resource === "iterations" &&
          !iterationId &&
          request.method === "POST"
        ) {
          const input = await body(request);
          const parent = findIteration(experiment, input.parentId);
          const iteration = createIteration(
            input.prompt || parent.prompt,
            parent.id,
            input.branch || parent.branch,
          );
          await store.mutate((current) => {
            findExperiment(current, id).iterations.push(iteration);
            return iteration;
          });
          return json(response, iteration, 201);
        }
        if (
          resource === "iterations" &&
          iterationId &&
          request.method === "PATCH"
        ) {
          const input = await body(request);
          const result = await store.mutate((current) => {
            const iteration = findIteration(
              findExperiment(current, id),
              iterationId,
            );
            if ("prompt" in input) {
              if (iteration.output && input.prompt !== iteration.prompt)
                throw new AppError(
                  "Create a new iteration before editing a prompt with an output.",
                  409,
                );
              iteration.prompt = text(input.prompt, "Prompt", 16000, true);
            }
            if ("feedback" in input)
              iteration.feedback = text(input.feedback, "Feedback", 8000);
            if ("scores" in input) {
              if (!iteration.output)
                throw new AppError("Add an output image before scoring.");
              iteration.scores = validateScores(input.scores);
              iteration.scoreSource = "manual";
            }
            iteration.updatedAt = new Date().toISOString();
            return iteration;
          });
          return json(response, result);
        }
        throw new AppError("Method not supported.", 405);
      }
      if (!["GET", "HEAD"].includes(request.method))
        throw new AppError("Method not supported.", 405);
      let file;
      if (/^\/files\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(path))
        file = join(store.directory, "assets", path.slice(7));
      else {
        const relative =
          path === "/" ? "index.html" : decodeURIComponent(path.slice(1));
        file = resolve(publicDirectory, relative);
        if (!file.startsWith(publicDirectory))
          throw new AppError("Not found.", 404);
      }
      const info = await stat(file);
      if (!info.isFile() || !TYPES[extname(file)])
        throw new AppError("Not found.", 404);
      response.writeHead(200, {
        "Content-Type": TYPES[extname(file)],
        "Cache-Control": "no-cache",
      });
      response.end(
        request.method === "HEAD" ? undefined : await readFile(file),
      );
    } catch (error) {
      if (response.headersSent) {
        response.end();
        return;
      }
      json(
        response,
        {
          error:
            error.code === "ENOENT"
              ? "File not found."
              : error.status
                ? error.message
                : "The operation failed. Your saved workspace is unchanged.",
        },
        error.status || (error.code === "ENOENT" ? 404 : 500),
      );
      if (!error.status && error.code !== "ENOENT")
        console.error("Request failed:", error.name);
    }
  };
}
