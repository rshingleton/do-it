# docs/reference/ layout

Precise, navigable, grepable: faster than searching the code, never a
substitute for it. Each page answers what lives here, where its boundaries
are, and how data moves through it. Tables and maps over prose; present
tense; a path for every module named.

## Pages

| Page | Required | Contents |
|------|----------|----------|
| `README.md` | yes | Index of pages, scope mapped, date, how to run build/test/lint |
| `overview.md` | yes | What the system is for, its major parts, how it is deployed (if inferable) |
| `module-map.md` | yes | One row per module: path, responsibility, depends on, depended on by |
| `entry-points.md` | yes | Routes, CLIs, jobs, workers, public APIs, with paths |
| `domains.md` | yes | Domain areas → code locations, `GLOSSARY.md` links, **Glossary gaps** |
| `test-landscape.md` | yes | Test kinds, where they live, how to run them, what each covers (facts only) |
| `data-flow.md` | when non-trivial | Persistence, queues, cross-service calls |
| `external-systems.md` | when present | Third-party services and the config that points at them (names, never values) |
| `build-and-deploy.md` | when non-obvious | Pipelines, environments, release steps |

## Module map row

```markdown
| Module | Path | Responsibility | Depends on | Used by |
|--------|------|----------------|------------|---------|
| Order intake | `src/orders/` | Validates and stores incoming orders | Pricing, Inventory | API routes, import job |
```

## Area refresh

`/map-it <area>` updates only the rows and sections for that area, and the
index date with the area named: `2026-10-19 (src/auth/ refreshed)`.
