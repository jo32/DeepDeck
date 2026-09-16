import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from '../benchmarks/webmcp/node_modules/js-yaml/index.js';
import { configureBenchmarkModel, validateModelOptions } from './webmcp-model-config.mjs';

test('DeepSeek 4.1 alias, endpoint and credential override stay in the private snapshot', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'bench-model-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, '.credentials.yaml'), 'version: 1\nrefs:\n  EXISTING: old-secret\n');
  const result = await configureBenchmarkModel(dir, { provider: 'deepseek-official', model: 'deepseek-v4.1', 'base-url': 'https://example.com/v1', 'api-key-env': 'TEST_KEY' }, { TEST_KEY: 'new-secret' });
  assert.deepEqual(result, { provider: 'deepseek-official', model: 'deepseek-flash', baseURL: 'https://example.com/v1', api: 'deepseek-native' });
  const settings = await readFile(join(dir, 'settings.yaml'), 'utf8');
  assert.ok(!settings.includes('new-secret'));
  assert.ok(!JSON.stringify(result).includes('new-secret'));
  assert.equal(yaml.load(settings)['llm-deepseek'].apiKeyEnv, 'DEEPDECK_BENCHMARK_API_KEY');
  const credentials = yaml.load(await readFile(join(dir, '.credentials.yaml'), 'utf8'));
  assert.deepEqual(credentials.refs, { EXISTING: 'old-secret', DEEPDECK_BENCHMARK_API_KEY: 'new-secret' });
  assert.equal((await stat(join(dir, 'settings.yaml'))).mode & 0o777, 0o600);
});
test('existing provider settings retained and explicit custom model registered', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'bench-model-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'settings.yaml'), yaml.dump({ 'llm-pi-ai': { providers: { gateway: { apiKeyEnv: 'SAVED_KEY', models: [{ id: 'old', contextWindow: 20000 }] } } } }));
  await configureBenchmarkModel(dir, { provider: 'gateway', model: 'new', api: 'openai-completions', 'base-url': 'https://example.com/v1' });
  const profile = yaml.load(await readFile(join(dir, 'settings.yaml'), 'utf8'))['llm-pi-ai'].providers.gateway;
  assert.equal(profile.apiKeyEnv, 'SAVED_KEY');
  assert.deepEqual(profile.models, [{ id: 'old', contextWindow: 20000 }, { id: 'new' }]);
});
test('reject ambiguous or unsafe configuration before launch', async () => {
  for (const options of [{ 'api-key': 'x', 'api-key-env': 'Y' }, { 'base-url': 'https://user:secret@example.com' }, { 'base-url': 'https://example.com?key=secret' }, { 'base-url': 'https://example.com' }, { provider: 'deepseek-official', model: 'x', api: 'openai-completions' }]) assert.throws(() => validateModelOptions(options));
  await assert.rejects(configureBenchmarkModel('/unused', { provider: 'deepseek-official', model: 'deepseek-flash', 'api-key-env': 'EMPTY' }, {}), /missing/);
});
test('literal and file keys use the same private credential route; native environment endpoint is frozen', async t => {
  const parent = await mkdtemp(join(tmpdir(), 'bench-model-test-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const keyPath = join(parent, 'key');
  await writeFile(keyPath, 'file-secret\n');
  for (const source of [{ 'api-key': 'literal-secret' }, { 'api-key-file': keyPath }]) {
    const dir = await mkdtemp(join(parent, 'case-'));
    const result = await configureBenchmarkModel(dir, { provider: 'deepseek-official', model: 'deepseek-flash', ...source }, { DEEPSEEK_BASE_URL: 'https://configured.example/v1' });
    assert.equal(result.baseURL, 'https://configured.example/v1');
    const creds = yaml.load(await readFile(join(dir, '.credentials.yaml'), 'utf8'));
    assert.equal(creds.refs.DEEPDECK_BENCHMARK_API_KEY, source['api-key'] ?? 'file-secret');
  }
});
