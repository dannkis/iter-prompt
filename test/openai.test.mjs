import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../src/openai.mjs';
import { createExperiment } from '../src/domain.mjs';

const response = value => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
test('model refinement sends explicit image context and structured outputs without exposing credentials', async () => {
  let called;
  const provider = new OpenAIProvider({ key: 'test-only-key', fetch: async (url, options) => {
    called = { url, options };
    return new Response(JSON.stringify(response({ prompt: 'Keep the handle. Use matte clay.', rationale: 'Restores the handle.', changes: ['Added handle constraint.'] })));
  } });
  const experiment = createExperiment({ title: 'Vase', prompt: 'A vase.', preserve: 'handle', transform: 'clay' });
  const result = await provider.refine(experiment, experiment.iterations[0], 'The handle disappeared.', ['data:image/png;base64,example']);
  assert.equal(result.provider, 'openai');
  assert.equal(called.url, 'https://api.openai.com/v1/responses');
  const payload = JSON.parse(called.options.body);
  assert.equal(payload.store, false);
  assert.equal(payload.text.format.type, 'json_schema');
  assert.equal(payload.input[0].content[2].type, 'input_image');
  assert.ok(!JSON.stringify(provider.config()).includes('test-only-key'));
});
test('evaluation rejects invalid estimates and surfaces refusals', async () => {
  const experiment = createExperiment({ title: 'Vase', prompt: 'A vase.' });
  const provider = new OpenAIProvider({ key: 'test-key', fetch: async () => new Response(JSON.stringify(response({ scores: { preservation: 150, transformation: 90, quality: 90 } }))) });
  await assert.rejects(provider.evaluate(experiment, experiment.iterations[0], []), /score/i);
  provider.fetch = async () => new Response(JSON.stringify({ output: [{ content: [{ type: 'refusal', refusal: 'Declined.' }] }] }));
  await assert.rejects(provider.refine(experiment, experiment.iterations[0], '', []), /declined/);
});
test('image edits always use the original input and return embedded image data', async () => {
  let body;
  const provider = new OpenAIProvider({ key: 'test-key', fetch: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/images/edits');
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ data: [{ b64_json: 'imagebytes' }] }));
  } });
  const result = await provider.generate('Use clay.', 'data:image/png;base64,original');
  assert.equal(body.images[0].image_url, 'data:image/png;base64,original');
  assert.equal(body.output_format, 'png');
  assert.equal(result.dataUrl, 'data:image/png;base64,imagebytes');
});
test('provider error messages do not echo secrets or upstream response bodies', async () => {
  const provider = new OpenAIProvider({ key: 'test-key', fetch: async () => new Response(JSON.stringify({ error: { message: 'sensitive upstream error test-key' } }), { status: 401 }) });
  await assert.rejects(provider.request('responses', {}), error => !error.message.includes('test-key') && /API key was rejected/.test(error.message));
});
