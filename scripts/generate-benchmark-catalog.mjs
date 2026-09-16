import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import yaml from '../benchmarks/webmcp/node_modules/js-yaml/index.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => yaml.load(readFileSync(resolve(root, file), 'utf8'));
const labels = read('apps/web/lib/benchmark-corpus-labels.json');
const registry = read('benchmarks/webmcp/sites/sites.yaml');
const tiers = { answer: 0, 'act-short': 0, 'act-long': 0, transaction: 0 };
const excluded = [];
const sites = registry.sites.map(site => {
  const copy = labels[site.id];
  if (!copy) throw new Error(`Missing public site label: ${site.id}`);
  const tasks = read(`benchmarks/webmcp/tasks/${site.id}.yaml`).tasks.filter(task => {
    if (task.excluded) excluded.push({ site: site.id, id: task.id, reason: task.excluded });
    return !task.excluded;
  }).map(task => {
    if (!copy.tasks[task.id]) throw new Error(`Missing public task label: ${task.id}`);
    if (!(task.tier in tiers)) throw new Error(`Unknown tier: ${task.tier}`);
    tiers[task.tier]++;
    // Intentionally publish editorial labels, not prompts with fixture credentials.
    return { id: task.id, tier: task.tier, title: copy.tasks[task.id] };
  });
  return { id: site.id, name: copy.name, category: copy.category, tasks };
});
const extraFiles = ['calibration-directory', 'calibration-hievents'];
const data = { sites, total: sites.reduce((sum, site) => sum + site.tasks.length, 0), tiers, excluded,
  calibrationCount: extraFiles.reduce((sum, name) => sum + read(`benchmarks/webmcp/tasks/${name}.yaml`).tasks.filter(t => !t.excluded).length, 0),
  templateCount: read('benchmarks/webmcp/templates/blog-author.yaml').tasks.length };
const output = resolve(root, 'apps/web/lib/benchmark-corpus.json');
const text = JSON.stringify(data, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== text) throw new Error('Public task catalog is stale; run node scripts/generate-benchmark-catalog.mjs.');
} else writeFileSync(output, text);
console.log(`Benchmark catalog: ${sites.length} sites, ${data.total} active tasks; ${data.calibrationCount} calibration, ${data.templateCount} template, ${excluded.length} excluded.`);
