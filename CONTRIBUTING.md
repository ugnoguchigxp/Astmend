# Contributing

Astmend welcomes small, focused contributions.

## Before you start

- Read [README.md](./README.md) and [implementation-plan.md](./implementation-plan.md).
- Follow [AGENT.md](./AGENT.md) for project-specific rules.
- Keep changes minimal and behavior-driven.

## Development workflow

1. Install dependencies.
2. Run `npm run check` before opening a pull request.
3. Add or update tests for any behavior change.
4. Prefer small, reviewable commits.

## Code guidelines

- Keep the TypeScript AST engine simple.
- Avoid unnecessary abstractions.
- Preserve backward compatibility unless a change is explicitly planned.
- Favor deterministic, idempotent behavior.

## Testing

- Use behavioral tests over implementation-detail tests.
- Run the relevant test file(s) when making focused changes.
- Do not introduce flaky tests.

## Pull requests

- Describe the problem, the approach, and the validation performed.
- Link to the relevant plan item when applicable.
- Include screenshots only when the change affects docs or examples.
