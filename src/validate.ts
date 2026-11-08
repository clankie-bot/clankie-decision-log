import { readFileSync } from 'node:fs';
import { assertSupported, checkSchema, type Issue } from './schema-check.ts';
import type { DecisionRecord } from './types.ts';

export type { Issue } from './schema-check.ts';

export interface ValidationResult {
  /** True when there are no errors. Warnings do not make a record invalid. */
  valid: boolean;
  errors: Issue[];
  warnings: Issue[];
}

export const schema: Record<string, unknown> = JSON.parse(
  readFileSync(new URL('../schema/decision.schema.json', import.meta.url), 'utf8'),
);
assertSupported(schema);

const time = (s: string) => Date.parse(s);

/**
 * Rules JSON Schema cannot express: cross-field consistency between status,
 * approval, revisions and evidence. Runs only on schema-valid records.
 */
function checkRules(d: DecisionRecord): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const a = d.approval;

  if (time(d.updatedAt) < time(d.createdAt)) errors.push({ path: '/updatedAt', message: 'must not be before createdAt' });

  if (d.status === 'approved' || d.status === 'rejected') {
    if (!a) errors.push({ path: '/approval', message: `is required when status is "${d.status}"` });
    else if (a.verdict !== d.status) errors.push({ path: '/approval/verdict', message: `is "${a.verdict}" but status is "${d.status}"` });
  }
  if (d.status === 'proposed' && a) errors.push({ path: '/approval', message: 'must be absent while status is "proposed"' });

  if (a) {
    // An answer binds to one decision revision and one source revision. Editing
    // either after approval means the approval no longer applies.
    if (a.decisionRevision !== d.revision)
      errors.push({ path: '/approval/decisionRevision', message: `answers revision ${a.decisionRevision}, record is at revision ${d.revision}` });
    if (a.sourceRevision !== d.subject.sourceRevision)
      errors.push({ path: '/approval/sourceRevision', message: `answers ${a.sourceRevision}, subject is ${d.subject.sourceRevision}` });
    if (time(a.at) < time(d.createdAt)) errors.push({ path: '/approval/at', message: 'must not be before createdAt' });
    if (a.by.kind === d.actor.kind && a.by.id === d.actor.id)
      warnings.push({ path: '/approval/by', message: 'the actor approved its own decision' });
  }

  if (d.status === 'superseded' && !d.supersededBy) errors.push({ path: '/supersededBy', message: 'is required when status is "superseded"' });
  if (d.supersededBy && d.status !== 'superseded') errors.push({ path: '/status', message: 'must be "superseded" when supersededBy is set' });
  if (d.supersedes === d.id || d.supersededBy === d.id) errors.push({ path: '/id', message: 'a decision cannot supersede itself' });

  const seen = new Set<string>();
  d.evidence.forEach((e, i) => {
    if (seen.has(e.id)) errors.push({ path: `/evidence/${i}/id`, message: `duplicate evidence id "${e.id}"` });
    seen.add(e.id);
    if (e.sourceRevision !== d.subject.sourceRevision)
      warnings.push({ path: `/evidence/${i}/sourceRevision`, message: `is stale: produced against ${e.sourceRevision}, subject is ${d.subject.sourceRevision}` });
  });

  const currentLivePass = d.evidence.some(
    (e) => e.sourceRevision === d.subject.sourceRevision && e.provenance === 'live' && e.outcome === 'pass',
  );
  if (d.status === 'approved' && !currentLivePass)
    warnings.push({ path: '/evidence', message: 'approved without live, passing evidence for the current source revision' });
  if (d.evidence.some((e) => e.outcome === 'fail') && d.limits.every((l) => l.kind !== 'known-issue'))
    warnings.push({ path: '/limits', message: 'evidence includes a failure but no known-issue limit explains it' });

  return { errors, warnings };
}

export function validate(value: unknown): ValidationResult {
  const errors = checkSchema(schema, value);
  if (errors.length > 0) return { valid: false, errors, warnings: [] };
  const rules = checkRules(value as DecisionRecord);
  return { valid: rules.errors.length === 0, ...rules };
}

/** Narrowing helper: throws with every error listed when the record is invalid. */
export function assertDecision(value: unknown): asserts value is DecisionRecord {
  const r = validate(value);
  if (!r.valid) throw new Error(`invalid decision record:\n${r.errors.map((e) => `  ${e.path || '/'} ${e.message}`).join('\n')}`);
}
