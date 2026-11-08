#!/usr/bin/env node
// decision-log validate <file.json>...   exit 0 when every file is valid, 1 otherwise
// decision-log render <file.json>        print Markdown (refuses invalid records)
import { readFileSync } from 'node:fs';
import { renderMarkdown } from './render.ts';
import type { DecisionRecord } from './types.ts';
import { validate } from './validate.ts';

function load(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

const [command, ...files] = process.argv.slice(2);
if ((command !== 'validate' && command !== 'render') || files.length === 0 || (command === 'render' && files.length !== 1)) {
  process.stderr.write('usage: decision-log validate <file.json>...\n       decision-log render <file.json>\n');
  process.exit(2);
}

let failed = false;
for (const file of files) {
  let result;
  let value: unknown;
  try {
    value = load(file);
    result = validate(value);
  } catch (err) {
    process.stderr.write(`${file}: ${(err as Error).message}\n`);
    failed = true;
    continue;
  }
  for (const e of result.errors) process.stderr.write(`${file}: error ${e.path || '/'} ${e.message}\n`);
  for (const w of result.warnings) process.stderr.write(`${file}: warning ${w.path || '/'} ${w.message}\n`);
  if (!result.valid) failed = true;
  else if (command === 'validate') process.stdout.write(`${file}: valid\n`);
  else process.stdout.write(renderMarkdown(value as DecisionRecord));
}
process.exit(failed ? 1 : 0);
