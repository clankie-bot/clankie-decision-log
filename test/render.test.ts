import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { escapeInline, renderMarkdown } from '../src/render.ts';
import type { DecisionRecord } from '../src/types.ts';

const exampleUrl = new URL('../examples/approved-retry-backoff.json', import.meta.url);
const example: DecisionRecord = JSON.parse(readFileSync(exampleUrl, 'utf8'));
const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

test('rendering the example matches the committed Markdown', () => {
  const golden = readFileSync(new URL('../examples/approved-retry-backoff.md', import.meta.url), 'utf8');
  assert.equal(renderMarkdown(example), golden);
});

test('fixture/replay and stale evidence are labelled in the table', () => {
  const d = structuredClone(example);
  d.evidence[0]!.sourceRevision = 'old0001';
  const md = renderMarkdown(d);
  assert.match(md, /replay, not live proof/);
  assert.match(md, /stale: old0001/);
});

test('user text cannot inject structure', () => {
  const d = structuredClone(example);
  d.title = 'Hi\n# injected | <script>';
  d.evidence[0]!.summary = 'a | b\nc';
  d.change.summary = '# heading\n- item\n1. step';
  const md = renderMarkdown(d);
  assert.ok(md.startsWith('# Hi \\# injected \\| \\<script\\>\n'));
  assert.ok(!md.includes('<script>'));
  assert.match(md, /\| a \\\| b c \|/);
  assert.match(md, /\n\\# heading\n\\- item\n1\\. step\n/);
  assert.equal(escapeInline('*x*'), '\\*x\\*');
});

test('proposed record renders without an approval', () => {
  const d = structuredClone(example);
  d.status = 'proposed';
  delete d.approval;
  d.evidence = [];
  d.limits = [];
  const md = renderMarkdown(d);
  assert.match(md, /Proposed, awaiting approval/);
  assert.match(md, /## Approval\n\n_Not yet answered._/);
  assert.match(md, /_No evidence attached._/);
  assert.match(md, /_None stated._/);
});

test('CLI validates and renders the example', () => {
  assert.equal(execFileSync(process.execPath, [cli, 'validate', fileURLToPath(exampleUrl)], { encoding: 'utf8' }).trim().endsWith(': valid'), true);
  assert.equal(execFileSync(process.execPath, [cli, 'render', fileURLToPath(exampleUrl)], { encoding: 'utf8' }), renderMarkdown(example));
});

test('CLI exits 1 on an invalid record and 2 on bad usage', () => {
  const bad = spawnSync(process.execPath, [cli, 'validate', fileURLToPath(new URL('./fixtures/invalid.json', import.meta.url))], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /error \/approval\/decisionRevision/);
  assert.equal(spawnSync(process.execPath, [cli], { encoding: 'utf8' }).status, 2);
});
