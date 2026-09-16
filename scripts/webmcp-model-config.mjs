import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from '../benchmarks/webmcp/node_modules/js-yaml/index.js';

export const modelOptions = Object.fromEntries(['base-url', 'api-key', 'api-key-env', 'api-key-file', 'api'].map(name => [name, { type: 'string' }]));
export function validateModelOptions(options) {
  const sources = ['api-key', 'api-key-env', 'api-key-file'].filter(key => options[key] !== undefined);
  if (sources.length > 1) throw new Error('Choose only one of --api-key, --api-key-env, --api-key-file.');
  if (options['api-key-env'] && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(options['api-key-env'])) throw new Error('Invalid --api-key-env name.');
  if (options['base-url'] !== undefined) {
    let url;
    try { url = new URL(options['base-url']); } catch { throw new Error('Invalid --base-url.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('--base-url must be an HTTP(S) endpoint without credentials, query or fragment.');
  }
  if (options.api && !['openai-completions', 'openai-responses', 'anthropic-messages'].includes(options.api)) throw new Error('Unsupported --api protocol.');
  if ((sources.length || options['base-url'] || options.api) && (!options.provider || !options.model)) throw new Error('Connection overrides require --provider and --model.');
  if (options.provider === 'deepseek-official' && options.api) throw new Error('deepseek-official uses the native DeepSeek protocol; omit --api.');
}
async function readYaml(path) {
  try { return yaml.load(await readFile(path, 'utf8')) ?? {}; } catch (error) { if (error.code === 'ENOENT') return {}; throw new Error(`Cannot read benchmark configuration ${path}`); }
}

/** Change only the disposable settings snapshot shared by both arms. */
export async function configureBenchmarkModel(directory, options, environment = process.env) {
  validateModelOptions(options);
  let { provider, model } = options;
  if (provider === 'deepseek-official' && ['deepseek-v4.1', 'deepseek-v4.1-flash'].includes(model)) model = 'deepseek-flash';
  if (!provider) return {};
  const settings = await readYaml(join(directory, 'settings.yaml'));
  const native = provider === 'deepseek-official';
  const profile = native ? (settings['llm-deepseek'] ??= {}) : ((settings['llm-pi-ai'] ??= {}).providers ??= {})[provider] ??= {};
  if (options['base-url']) profile.baseURL = options['base-url'];
  if (native && !profile.baseURL) profile.baseURL = environment.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  if (profile.baseURL) validateModelOptions({ provider, model, 'base-url': profile.baseURL });
  if (options.api) profile.api = options.api;
  let secret = options['api-key'];
  if (options['api-key-env']) secret = environment[options['api-key-env']];
  if (options['api-key-file']) secret = (await readFile(options['api-key-file'], 'utf8')).trim();
  if (['api-key', 'api-key-env', 'api-key-file'].some(key => options[key] !== undefined)) {
    if (typeof secret !== 'string' || !secret.trim() || /[\r\n]/.test(secret)) throw new Error('API key is missing, empty or contains a newline.');
    const credentials = await readYaml(join(directory, '.credentials.yaml'));
    if (credentials.version !== undefined && credentials.version !== 1) throw new Error('Unsupported credentials file version.');
    credentials.version = 1;
    (credentials.refs ??= {}).DEEPDECK_BENCHMARK_API_KEY = secret.trim();
    profile.apiKeyEnv = 'DEEPDECK_BENCHMARK_API_KEY';
    await writeFile(join(directory, '.credentials.yaml'), yaml.dump(credentials), { mode: 0o600 });
  }
  // Explicit model lists are authoritative. Preserve all configured model metadata.
  if (profile.models && !profile.models.some(entry => entry.id === model)) profile.models.push({ id: model });
  if (!native && !profile.models && options.api) profile.models = [{ id: model }];
  settings['agent-default-model'] = { ...settings['agent-default-model'], provider, model };
  await writeFile(join(directory, 'settings.yaml'), yaml.dump(settings), { mode: 0o600 });
  return { provider, model, baseURL: profile.baseURL, api: native ? 'deepseek-native' : profile.api };
}
