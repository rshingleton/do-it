#!/usr/bin/env node
// do-it tracker CLI. One interface over the local, GitHub and Jira trackers.
// Every command prints JSON on stdout; failures print {"error": ...} and exit 1.
//
//   tracker.mjs config
//   tracker.mjs trust      pin the repo's DO_IT_LINT_CMD / JIRA_BASE_URL values (only on the user's say-so)
//   tracker.mjs create --title T [--type bug|feature|todo|defer] [--body B | --body-file F]
//                      [--source S] [--external-id X] [--label L]... [--tracker local|github|jira]
//                      Jira: [--project KEY] [--component C|none]... [--epic KEY|none | --parent KEY]
//                      (defaults JIRA_PROJECT_KEY, JIRA_COMPONENTS, JIRA_DEFAULT_EPIC; one of each is required)
//   tracker.mjs list [--status open|closed|all]
//       Local issues only; with another tracker it adds a note, the tracker holds those.
//   tracker.mjs get <ref>
//   tracker.mjs comment <ref> (--body B | --body-file F)
//   tracker.mjs start <ref>
//   tracker.mjs close <ref> [--body B | --body-file F]
//   tracker.mjs publish --spec F [--tracker github|jira]
//       F (or "-" for stdin) is JSON: {"title", "body", "phases": [{"n", "title", "body"}], "parent"?, "components"?, "project"?}
//
// A ref routes by its shape (docs/issues/x.md, #42, ABC-123, an issue URL),
// so it reaches the tracker it came from whatever DO_IT_TRACKER says.

import fs from 'node:fs';
import { loadConfig, redact, resolveDocs, maskUrlCredentials, trust } from './config.mjs';
import { isMain } from '../../it-core/scripts/is-main.mjs';
import { parseRef } from './refs.mjs';
import { localTracker } from './adapters/local.mjs';
import { githubTracker } from './adapters/github.mjs';
import { jiraTracker } from './adapters/jira.mjs';

const FACTORIES = { local: localTracker, github: githubTracker, jira: jiraTracker };

export function parseArgs(argv) {
  const opts = { _: [], label: [], component: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      opts._.push(a);
      continue;
    }
    // --key=value, or --key value. Values may start with dashes (a "---" rule,
    // a "-- signed" footer), so only a missing value is an error.
    const eq = a.indexOf('=');
    const flag = eq > 0 ? a.slice(0, eq) : a;
    const name = flag.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    let value;
    if (eq > 0) value = a.slice(eq + 1);
    else {
      value = argv[i + 1];
      if (value === undefined) throw new Error(`${a} needs a value`);
      i++;
    }
    if (name === 'label' || name === 'component') opts[name].push(value);
    else opts[name] = value;
  }
  return opts;
}

function readText(opts, field = 'body') {
  const file = opts[`${field}File`];
  if (file) return fs.readFileSync(file === '-' ? 0 : file, 'utf8');
  return opts[field];
}

export function trackerFor(kind, config, deps = {}) {
  const factory = FACTORIES[kind];
  if (!factory) throw new Error(`unknown tracker "${kind}"; use local, github or jira`);
  return factory(config.values, { root: config.root, ...deps });
}

function trackerForRef(ref, config, deps) {
  const parsed = parseRef(ref);
  if (!parsed) throw new Error(`cannot tell which tracker "${ref}" belongs to`);
  return trackerFor(parsed.kind, config, deps);
}

export async function run(argv, { config = loadConfig(), deps = {} } = {}) {
  const opts = parseArgs(argv);
  const [command, ref] = opts._;

  switch (command) {
    case 'config':
      return {
        root: config.root,
        tracker: config.values.DO_IT_TRACKER,
        docs: resolveDocs(config.root, config.values),
        values: redact(config.values),
        sources: config.sources,
        warnings: config.warnings,
        // The ignored values, so the user can review them before trusting.
        untrusted: Object.fromEntries((config.untrusted ?? []).map((k) => [k, maskUrlCredentials(config.trust.values[k])])),
      };
    case 'trust':
      return { trusted: Object.fromEntries(Object.entries(trust(config)).map(([k, v]) => [k, maskUrlCredentials(v)])) };
    case 'create': {
      if (!opts.title) throw new Error('create needs --title');
      const t = trackerFor(opts.tracker || config.values.DO_IT_TRACKER, config, deps);
      return t.create({
        title: opts.title,
        type: opts.type,
        body: readText(opts) || '',
        source: opts.source,
        externalId: opts.externalId,
        labels: opts.label,
        // Jira only; the other trackers ignore them.
        project: opts.project,
        components: opts.component,
        epic: opts.epic,
        parent: opts.parent,
      });
    }
    case 'list': {
      const issues = localTracker(config.values, { root: config.root }).list({ status: opts.status });
      const kind = config.values.DO_IT_TRACKER;
      return kind === 'local' ? { issues } : { issues, note: `${kind} issues live in the tracker; only local issues are listed` };
    }
    case 'get':
    case 'start':
      if (!ref) throw new Error(`${command} needs a ref`);
      return trackerForRef(ref, config, deps)[command](ref);
    case 'comment': {
      const text = readText(opts);
      if (!ref || !text) throw new Error('comment needs a ref and --body or --body-file');
      return trackerForRef(ref, config, deps).comment(ref, text);
    }
    case 'close':
      if (!ref) throw new Error('close needs a ref');
      return trackerForRef(ref, config, deps).close(ref, readText(opts));
    case 'publish': {
      if (!opts.spec) throw new Error('publish needs --spec <file|->');
      const spec = JSON.parse(fs.readFileSync(opts.spec === '-' ? 0 : opts.spec, 'utf8'));
      return trackerFor(opts.tracker || config.values.DO_IT_TRACKER, config, deps).publish(spec);
    }
    default:
      throw new Error(`unknown command "${command || ''}"; see the header of tracker.mjs`);
  }
}

if (isMain(import.meta.url)) {
  run(process.argv.slice(2))
    .then((out) => {
      // A partial publish still prints the refs it made, then fails the command.
      if (out?.error) {
        out.error = maskUrlCredentials(out.error);
        process.exitCode = 1;
      }
      process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    })
    .catch((e) => {
      process.stdout.write(`${JSON.stringify({ error: maskUrlCredentials(e.message) })}\n`);
      process.exit(1);
    });
}
