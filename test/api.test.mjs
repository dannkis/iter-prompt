import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { Store } from "../src/store.mjs";
import { createHandler } from "../src/app.mjs";

test("a complete experiment keeps prompts, images and evaluations aligned", async () => {
  const directory = await mkdtemp(join(tmpdir(), "iter-api-"));
  const store = new Store(directory);
  await store.init();
  const png = await readFile(
    new URL("../public/demo/reference.png", import.meta.url),
  );
  const dataUrl = "data:image/png;base64," + png.toString("base64");
  const server = http.createServer(createHandler(store));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (path, method = "GET", data, expected = 200) => {
    const response = await fetch(base + path, {
      method,
      headers: data !== undefined ? { "Content-Type": "application/json" } : {},
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
    assert.equal(
      response.status,
      expected,
      method + " " + path + ": " + response.status,
    );
    return response.json();
  };
  try {
    await call("/api/experiments", "POST", null, 400);
    const experiment = await call(
      "/api/experiments",
      "POST",
      {
        title: "Clay study",
        preserve: "handle",
        transform: "clay",
        prompt: "Keep the handle. Use clay.",
      },
      201,
    );
    const id = experiment.id,
      run = experiment.iterations[0].id;
    await call(
      "/api/upload",
      "POST",
      { experimentId: id, role: "reference", dataUrl, name: "reference.png" },
      201,
    );
    await call(
      "/api/experiments/" + id + "/iterations/" + run,
      "PATCH",
      { scores: { preservation: 80, transformation: 80, quality: 80 } },
      400,
    );
    const output = await call(
      "/api/upload",
      "POST",
      {
        experimentId: id,
        iterationId: run,
        role: "output",
        dataUrl,
        name: "output.png",
      },
      201,
    );
    assert.equal((await fetch(base + output.url)).status, 200);
    await call(
      "/api/experiments/" + id + "/iterations/" + run,
      "PATCH",
      { prompt: "Change everything." },
      409,
    );
    await call(
      "/api/experiments/" + id,
      "PATCH",
      { transform: "Change everything." },
      409,
    );
    await call(
      "/api/upload",
      "POST",
      { experimentId: id, role: "reference", dataUrl },
      409,
    );
    await call("/api/experiments/" + id + "/iterations/" + run, "PATCH", {
      scores: { preservation: 90, transformation: 70, quality: 85 },
      feedback: "More texture.",
    });
    const refined = await call("/api/refine", "POST", {
      experimentId: id,
      iterationId: run,
      strategy: "local",
      feedback: "Retain the handle.",
    });
    assert.match(refined.prompt, /Retain the handle/);
    const child = await call(
      "/api/experiments/" + id + "/iterations",
      "POST",
      { parentId: run, prompt: refined.prompt, branch: "Texture" },
      201,
    );
    assert.equal(child.parentId, run);
    assert.equal(child.output, null);
    assert.equal(child.scoreSource, null);
    const exported = await call("/api/experiments/" + id + "/export");
    assert.equal(exported.experiment.reference.dataUrl, dataUrl);
    assert.equal(exported.experiment.iterations[0].output.dataUrl, dataUrl);
    await call(
      "/api/evaluate",
      "POST",
      { experimentId: id, iterationId: run },
      503,
    );
    const denied = await fetch(base + "/api/workspace", {
      headers: { Origin: "https://unrelated.example" },
    });
    assert.equal(denied.status, 403);
    const workspace = await call("/api/workspace");
    assert.equal(
      workspace.experiments[0].iterations[0].prompt,
      "Keep the handle. Use clay.",
    );
    assert.equal(workspace.experiments[0].iterations[0].scoreSource, "manual");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
test("model outputs and estimates attach to the selected immutable prompt snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "iter-model-api-"));
  const store = new Store(directory);
  await store.init();
  const dataUrl =
    "data:image/png;base64," +
    (
      await readFile(new URL("../public/demo/reference.png", import.meta.url))
    ).toString("base64");
  let generationCalls = 0;
  const provider = {
    config: () => ({
      connected: true,
      textModel: "test-vision",
      imageModel: "test-image",
    }),
    generate: async (prompt, reference) => {
      generationCalls++;
      assert.equal(reference, dataUrl);
      return { dataUrl, model: "test-image" };
    },
    evaluate: async () => ({
      scores: { preservation: 90, transformation: 75, quality: 85 },
      summary: "Test estimate.",
      observations: [],
      suggestions: ["More texture."],
      model: "test-vision",
    }),
  };
  const server = http.createServer(createHandler(store, provider));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  const post = async (path, data) =>
    fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  try {
    const experiment = await (
      await post("/api/experiments", {
        title: "Generated study",
        prompt: "Use clay.",
      })
    ).json();
    const selection = {
      experimentId: experiment.id,
      iterationId: experiment.iterations[0].id,
    };
    assert.equal(
      (await post("/api/upload", { ...selection, role: "reference", dataUrl }))
        .status,
      201,
    );
    assert.equal((await post("/api/generate", selection)).status, 200);
    assert.equal((await post("/api/generate", selection)).status, 409);
    assert.equal(generationCalls, 1);
    const result = await (await post("/api/evaluate", selection)).json();
    assert.equal(result.scoreSource, "ai");
    assert.equal(result.evaluation.model, "test-vision");
    assert.equal(result.generation.model, "test-image");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
