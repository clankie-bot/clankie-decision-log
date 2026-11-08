import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertSupported } from '../src/schema-check.ts';
import type { DecisionRecord } from '../src/types.ts';
import { assertDecision, schema, validate } from '../src/validate.ts';

const example: DecisionRecord = JSON.parse(
  readFileSync(new URL('../examples/approved-retry-backoff.json', import.meta.url), 'utf8'),
);
const fresh = (): DecisionRecord => structuredClone(example);
const paths = (issues: { path: string }[]) => issues.map((i) => i.path);

test('the example record is valid with no warnings', () => {
  const r = validate(example);
  assert.deepEqual(r.errors, []);
  // The only live passing evidence is the unit check, so no "approved without live evidence" warning.
  assert.deepEqual(r.warnings, []);
  assert.equal(r.valid, true);
});

test('a minimal proposed record is valid', () => {
  const d = fresh();
  d.status = 'proposed';
  delete d.approval;
  d.evidence = [];
  d.limits = [];
  d.rationale = { why: 'because', alternatives: [] };
  d.subject.refs = [];
  delete d.change.paths;
  assert.equal(validate(d).valid, true);
});

test('the validator implements every keyword the schema uses', () => {
  assert.doesNotThrow(() => assertSupported(schema));
  assert.throws(() => assertSupported({ type: 'object', oneOf: [] }), /unsupported schema keyword "oneOf"/);
  assert.throws(() => assertSupported({ type: 'string', format: 'email' }), /unsupported format "email"/);
});

test('schema errors: missing, wrong type, enum, extra property, format, pattern', () => {
  const d = fresh() as unknown as Record<string, any>;
  delete d.title;
  d.revision = 0;
  d.status = 'done';
  d.colour = 'red';
  d.createdAt = 'yesterday';
  d.id = ' spaces ';
  d.evidence[0].uri = 'not a uri';
  d.evidence[1].provenance = 'synthetic';
  const r = validate(d);
  assert.equal(r.valid, false);
  assert.deepEqual(paths(r.errors).sort(), [
    '/colour', '/createdAt', '/evidence/0/uri', '/evidence/1/provenance', '/id', '/revision', '/status', '/title',
  ]);
});

test('non-objects are rejected cleanly', () => {
  for (const v of [null, 42, 'x', []]) {
    const r = validate(v);
    assert.equal(r.valid, false);
    assert.equal(r.errors[0]!.path, '');
  }
});

test('approval must answer the current decision revision', () => {
  const d = fresh();
  d.revision = 3; // edited after approval
  const r = validate(d);
  assert.equal(r.valid, false);
  assert.match(r.errors.find((e) => e.path === '/approval/decisionRevision')!.message, /answers revision 2, record is at revision 3/);
});

test('approval must answer the current source revision', () => {
  const d = fresh();
  d.subject.sourceRevision = 'aaaa111';
  for (const e of d.evidence) e.sourceRevision = 'aaaa111';
  const r = validate(d);
  assert.deepEqual(paths(r.errors), ['/approval/sourceRevision']);
});

test('status and approval must agree', () => {
  const missing = fresh();
  delete missing.approval;
  assert.deepEqual(paths(validate(missing).errors), ['/approval']);

  const mismatch = fresh();
  mismatch.status = 'rejected';
  assert.deepEqual(paths(validate(mismatch).errors), ['/approval/verdict']);

  const early = fresh();
  early.status = 'proposed';
  assert.deepEqual(paths(validate(early).errors), ['/approval']);
});

test('superseded needs supersededBy, and supersededBy needs superseded', () => {
  const a = fresh();
  a.status = 'superseded';
  assert.ok(paths(validate(a).errors).includes('/supersededBy'));
  const b = fresh();
  b.supersededBy = 'dec-next';
  assert.ok(paths(validate(b).errors).includes('/status'));
  const c = fresh();
  c.supersedes = c.id;
  assert.ok(paths(validate(c).errors).includes('/id'));
});

test('time ordering: updatedAt and approval.at cannot precede createdAt', () => {
  const d = fresh();
  d.updatedAt = '2026-11-07T20:00:00Z';
  d.approval!.at = '2026-11-07T20:00:00-00:00';
  assert.deepEqual(paths(validate(d).errors).sort(), ['/approval/at', '/updatedAt']);
});

test('duplicate evidence ids are errors', () => {
  const d = fresh();
  d.evidence[1]!.id = 'unit';
  assert.deepEqual(paths(validate(d).errors), ['/evidence/1/id']);
});

test('warnings: stale evidence, no live proof, self-approval, unexplained failure', () => {
  const d = fresh();
  d.evidence[0]!.sourceRevision = 'old0001';
  d.evidence[1]!.outcome = 'fail';
  d.approval!.by = { ...d.actor };
  const r = validate(d);
  assert.equal(r.valid, true, 'warnings never invalidate a record');
  assert.deepEqual(paths(r.warnings).sort(), ['/approval/by', '/evidence', '/evidence/0/sourceRevision', '/limits']);
});

test('fixture or replay evidence alone does not count as live proof', () => {
  const d = fresh();
  d.evidence = d.evidence.filter((e) => e.provenance !== 'live');
  assert.ok(validate(d).warnings.some((w) => w.path === '/evidence' && /live/.test(w.message)));
});

test('assertDecision narrows or throws with every error', () => {
  assert.doesNotThrow(() => assertDecision(example));
  assert.throws(() => assertDecision({ formatVersion: '0.1' }), (err: Error) => /\/id is required/.test(err.message) && /\/title is required/.test(err.message));
});
