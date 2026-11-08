// TypeScript view of schema/decision.schema.json (format 0.1). The schema is the
// source of truth; keep this file in step with it.

export type DecisionStatus = 'proposed' | 'approved' | 'rejected' | 'superseded' | 'withdrawn';

export interface Party {
  kind: 'agent' | 'human';
  id: string;
  name?: string;
}

export type RefKind = 'issue' | 'change' | 'thread' | 'ask' | 'decision' | 'doc' | 'run' | 'other';

export interface Ref {
  kind: RefKind;
  ref: string;
  url?: string;
  quote?: string;
}

export type EvidenceKind = 'recording' | 'check' | 'screenshot' | 'log' | 'comparison' | 'other';

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  uri: string;
  summary: string;
  /** Evidence holds only for the revision it was produced against. */
  sourceRevision: string;
  /** Fixtures and replays are labelled and never count as live proof. */
  provenance: 'live' | 'fixture' | 'replay';
  outcome: 'pass' | 'fail' | 'inconclusive' | 'not-applicable';
  environment?: Record<string, string>;
  capturedAt: string;
}

export interface Limit {
  kind: 'untested' | 'known-issue' | 'assumption' | 'scope';
  statement: string;
}

export interface Approval {
  verdict: 'approved' | 'rejected';
  by: Party;
  at: string;
  /** The decision revision this verdict answers. */
  decisionRevision: number;
  /** The source revision this verdict answers. */
  sourceRevision: string;
  note?: string;
}

export interface DecisionRecord {
  formatVersion: '0.1';
  id: string;
  revision: number;
  title: string;
  status: DecisionStatus;
  actor: Party;
  subject: { sourceRevision: string; refs: Ref[] };
  change: { summary: string; details?: string; paths?: string[] };
  rationale: {
    why: string;
    alternatives: { choice: string; tradeoff: string }[];
    intent?: Ref[];
  };
  evidence: Evidence[];
  limits: Limit[];
  approval?: Approval;
  supersedes?: string;
  supersededBy?: string;
  createdAt: string;
  updatedAt: string;
}
