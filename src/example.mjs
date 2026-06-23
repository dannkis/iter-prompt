import { createExperiment, createIteration } from './domain.mjs';

const asset = name => ({ url: '/demo/' + name + '.png', name: name + '.png', mime: 'image/png' });
export function exampleWorkspace() {
  const experiment = createExperiment({
    title: 'Ceramic, reimagined',
    goal: 'Turn a glossy still life into a tactile clay illustration.',
    preserve: 'The vase silhouette, its right-side handle, the orange, their relative positions, and the camera angle.',
    transform: 'Replace glossy cobalt ceramic with warm terracotta clay. Use a dusty pink backdrop, soft light, and fine surface texture.',
    prompt: 'Reimagine this still life as a warm, tactile clay illustration. Keep the vase and orange in place. Use a dusty pink background and soft studio light.',
  });
  experiment.id = 'example-ceramic';
  experiment.isExample = true;
  experiment.reference = asset('reference');
  const prompts = [
    experiment.iterations[0].prompt,
    'Transform the reference still life into matte terracotta clay. Preserve the vase silhouette, right-side handle, orange placement, framing, and camera angle. Use a dusty pink backdrop and soft directional light.',
    'Use the reference as the exact composition guide. Preserve the vase silhouette and right-side handle, the orange, their spacing, and the camera angle. Change only the material and palette: matte terracotta clay, a dusty pink backdrop, fine tactile texture, and soft directional light. Avoid glossy highlights and added objects.',
  ];
  experiment.iterations = prompts.map((prompt, index) => {
    const iteration = createIteration(prompt, index ? 'example-v' + index : null);
    iteration.id = 'example-v' + (index + 1);
    iteration.output = asset('output-' + (index + 1));
    iteration.scores = [
      { preservation: 68, transformation: 58, quality: 82 },
      { preservation: 80, transformation: 83, quality: 86 },
      { preservation: 94, transformation: 90, quality: 88 },
    ][index];
    iteration.scoreSource = 'example';
    iteration.feedback = [
      'The vase has shifted and the material still feels too smooth. Keep the composition closer to the reference.',
      'The handle is thinner than the reference. Keep its shape and give the clay a finer surface texture.',
      'The composition is close. Try slightly more texture without changing the silhouette.',
    ][index];
    return iteration;
  });
  return { version: 1, experiments: [experiment] };
}
