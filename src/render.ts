import type { DecisionRecord, Evidence, Party, Ref } from './types.ts';

// Markdown rendering of a decision record. Deterministic: same record, same bytes.
// User text is escaped so a title or summary cannot inject headings, tables or HTML.

const INLINE_SPECIALS = /[\\`*_{}[\]()<>#+!|~]/g;

/** Escape text for inline Markdown (single line). Newlines become spaces. */
export function escapeInline(s: string): string {
  return s.replace(/\r?\n/g, ' ').replace(INLINE_SPECIALS, (c) => `\\${c}`);
}

/** Escape a multi-line block: each line is escaped inline, and leading list/heading markers are neutralized. */
function escapeBlock(s: string): string {
  return s
    .split(/\r?\n/)
    .map((line) => escapeInline(line).replace(/^(\s*)([-=])/, '$1\\$2').replace(/^(\s*\d+)([.)])/, '$1\\$2'))
    .join('\n');
}

const party = (p: Party) => `${escapeInline(p.name ?? p.id)} (${p.kind}${p.name ? `, ${escapeInline(p.id)}` : ''})`;

function ref(r: Ref): string {
  const label = `${r.kind}: ${escapeInline(r.ref)}`;
  const linked = r.url ? `[${label}](<${r.url.replace(/[<>]/g, encodeURIComponent)}>)` : label;
  return r.quote ? `${linked} — “${escapeInline(r.quote)}”` : linked;
}

const STATUS_LABEL: Record<DecisionRecord['status'], string> = {
  proposed: 'Proposed, awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
  superseded: 'Superseded',
  withdrawn: 'Withdrawn',
};

function evidenceRow(e: Evidence, current: string): string {
  const labels: string[] = [];
  if (e.provenance !== 'live') labels.push(`**${e.provenance}, not live proof**`);
  if (e.sourceRevision !== current) labels.push(`**stale: ${escapeInline(e.sourceRevision)}**`);
  const summary = [escapeInline(e.summary), ...labels].join(' — ');
  const link = `[${escapeInline(e.id)}](<${e.uri.replace(/[<>]/g, encodeURIComponent)}>)`;
  return `| ${link} | ${e.kind} | ${e.outcome} | ${summary} |`;
}

export function renderMarkdown(d: DecisionRecord): string {
  const out: string[] = [];
  out.push(`# ${escapeInline(d.title)}`, '');
  out.push(`- **Status:** ${STATUS_LABEL[d.status]}`);
  out.push(`- **Decision:** \`${d.id}\` revision ${d.revision}`);
  out.push(`- **Source revision:** \`${d.subject.sourceRevision.replaceAll('`', '')}\``);
  out.push(`- **Actor:** ${party(d.actor)}`);
  out.push(`- **Updated:** ${d.updatedAt}`);
  if (d.supersedes) out.push(`- **Supersedes:** \`${d.supersedes}\``);
  if (d.supersededBy) out.push(`- **Superseded by:** \`${d.supersededBy}\``);
  for (const r of d.subject.refs) out.push(`- ${ref(r)}`);
  out.push('');

  out.push('## What changed', '', escapeBlock(d.change.summary));
  if (d.change.details) out.push('', escapeBlock(d.change.details));
  if (d.change.paths?.length) out.push('', ...d.change.paths.map((p) => `- \`${p.replaceAll('`', '')}\``));
  out.push('');

  out.push('## Why', '', escapeBlock(d.rationale.why));
  if (d.rationale.intent?.length) out.push('', 'Supported by:', '', ...d.rationale.intent.map((r) => `- ${ref(r)}`));
  if (d.rationale.alternatives.length) {
    out.push('', '### Alternatives considered', '');
    for (const alt of d.rationale.alternatives) out.push(`- **${escapeInline(alt.choice)}** — ${escapeInline(alt.tradeoff)}`);
  }
  out.push('');

  out.push('## Evidence', '');
  if (d.evidence.length === 0) out.push('_No evidence attached._');
  else out.push('| Evidence | Kind | Outcome | Summary |', '| --- | --- | --- | --- |', ...d.evidence.map((e) => evidenceRow(e, d.subject.sourceRevision)));
  out.push('');

  out.push('## Limits', '');
  if (d.limits.length === 0) out.push('_None stated._');
  else for (const l of d.limits) out.push(`- **${l.kind}:** ${escapeInline(l.statement)}`);
  out.push('');

  out.push('## Approval', '');
  const a = d.approval;
  if (!a) out.push('_Not yet answered._');
  else {
    out.push(`**${a.verdict === 'approved' ? 'Approved' : 'Rejected'}** by ${party(a.by)} at ${a.at}, for revision ${a.decisionRevision} at \`${a.sourceRevision.replaceAll('`', '')}\`.`);
    if (a.note) out.push('', `> ${escapeInline(a.note)}`);
  }
  out.push('');
  return out.join('\n');
}
