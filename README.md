<div align="center">

# clankie-decision-log

**A record of what an agent changed and why, with proof.**

A small open format for agent decisions: what changed, why, the evidence, the limits and the approval, so a person can review the work without reading the transcript.

Part of [Clankie](https://clankie.bot): [clankie-decision-log](https://github.com/clankie-bot/clankie-decision-log) · [clankie-extension-sdk](https://github.com/clankie-bot/clankie-extension-sdk) · [clankie-fast-ci](https://github.com/clankie-bot/clankie-fast-ci) · [sandbox-template](https://github.com/clankie-bot/sandbox-template)

</div>

An open format for recording the decisions an agent makes, so a person can review
them without reading the agent's transcript. Each record says:

- **what changed** (`change`): a summary, optional details and the paths touched;
- **why** (`rationale`): the reason, the alternatives considered and where the
  requester's intent supports the choice;
- **the evidence** (`evidence`): recordings, checks, screenshots, logs and comparisons,
  each tied to the source revision it was produced against and labelled `live`,
  `fixture` or `replay`;
- **the limits** (`limits`): what is untested, known issues, assumptions and scope;
- **the approval** (`approval`): who approved or rejected the change, when, and which
  decision revision and source revision they answered.

## Contents

| Path | What it is |
| --- | --- |
| [`schema/decision.schema.json`](schema/decision.schema.json) | JSON Schema (2020-12) for one decision record |
| [`src/types.ts`](src/types.ts) | TypeScript types matching the schema |
| [`src/validate.ts`](src/validate.ts) | Validator: the schema plus cross-field rules |
| [`src/render.ts`](src/render.ts) | Markdown rendering |
| [`src/cli.ts`](src/cli.ts) | `decision-log validate` and `decision-log render` |
| [`examples/`](examples) | An approved example record and its rendered Markdown |

## Rules beyond the schema

Some rules can't be written in JSON Schema, so the validator checks them separately.

Errors (the record is invalid):

- `approved` and `rejected` records need an `approval` whose verdict matches the status.
  `proposed` records must not have one.
- An approval answers exactly one decision revision and one source revision. If either
  changes after approval, the approval no longer applies and the record is invalid
  until someone answers again.
- `superseded` and `supersededBy` must appear together. A record can't supersede itself.
- `updatedAt` and `approval.at` can't be earlier than `createdAt`.
- Evidence ids must be unique.

Warnings (the record stays valid, but a reviewer should look):

- The evidence was produced against a different source revision (it's stale).
- The record is approved without live, passing evidence for the current source
  revision. Fixture and replay evidence never counts as live proof.
- The actor approved its own decision.
- A piece of evidence failed and no `known-issue` limit explains why.

## Use

Requires Node 24 or later. Node runs the TypeScript directly, so there is no build step
and no runtime dependency.

```sh
node src/cli.ts validate examples/approved-retry-backoff.json
node src/cli.ts render examples/approved-retry-backoff.json
```

```ts
import { validate, renderMarkdown } from 'clankie-decision-log';

const result = validate(record); // { valid, errors, warnings }; each issue has a JSON Pointer path
if (result.valid) console.log(renderMarkdown(record));
```

The renderer escapes record text, so a title or summary can't inject headings, tables
or HTML. It also marks fixture, replay and stale evidence in the evidence table.

## Develop

```sh
pnpm install          # dev only: typescript, @types/node
node --test test/*.test.ts
pnpm typecheck
pnpm render-examples  # regenerate examples/*.md after changing the renderer
```

The validator reads `schema/decision.schema.json` itself. It supports only the
JSON Schema keywords that file uses, and it throws on any other keyword. That way the
schema can't gain a rule the validator silently ignores.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
