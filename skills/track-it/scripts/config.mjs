// do-it configuration: layered dotenv files, then the process environment.
//
// Precedence, lowest first:
//   1. built-in defaults
//   2. $XDG_CONFIG_HOME/do-it/config.env   (user defaults; may hold secrets)
//   3. <repo>/.do-it/config.env            (project, committed; no secrets)
//   4. <repo>/.do-it/local.env             (project, gitignored; may hold secrets)
//   5. process environment                 (DO_IT_*, JIRA_*, GITHUB_* only)
//
// Files inside the repo are untrusted input for GUARDED_KEYS (ADR 0006): their
// values apply only once `tracker.mjs trust` has pinned exactly those values.
//
// Shared by the tracker CLI, the Claude Code hooks and the OpenCode plugin.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULTS = {
  DO_IT_TRACKER: 'local',
  DO_IT_ISSUES_DIR: 'docs/issues',
  DO_IT_PLANNING_DIR: 'docs/planning',
  DO_IT_COMMIT: 'ask',
  DO_IT_PROTECTED_BRANCHES: 'main,master',
  DO_IT_PUBLISH_PLANS: 'false',
  DO_IT_HOOKS: 'on',
  DO_IT_COMPLIANCE_DIR: '.compliance-rules',
  DO_IT_LINT_CMD: '',
  DO_IT_HOOK_TIMEOUT: '20',
  DO_IT_MAP: 'on',
  DO_IT_CONTEXT: '',
  DO_IT_CONTEXT_MAP: '',
  DO_IT_GLOSSARY: '',
  DO_IT_CHANGELOG: '',
  DO_IT_ADR_DIR: '',
  DO_IT_REFERENCE_DIR: '',
  DO_IT_TODO_FILE: '',
  DO_IT_ROADMAP_DIR: '',
  DO_IT_RESEARCH_DIR: '',
  DO_IT_GITHUB_REPO: '',
  DO_IT_GITHUB_START_LABEL: '',
  JIRA_BASE_URL: '',
  JIRA_PROJECT_KEY: '',
  JIRA_AUTH: '',
  JIRA_EMAIL: '',
  JIRA_API_TOKEN: '',
  JIRA_ISSUE_TYPE: 'Task',
  JIRA_EPIC_TYPE: 'Epic',
  JIRA_DEFAULT_EPIC: '',
  JIRA_COMPONENTS: '',
  JIRA_SUBTASK_TYPE: 'Sub-task',
  JIRA_EPIC_LINK_FIELD: '',
  JIRA_EPIC_NAME_FIELD: '',
  JIRA_ASSIGNEE: '',
  JIRA_START_TRANSITION: 'In Progress',
  JIRA_DONE_TRANSITION: 'Done',
};

const ENV_PREFIXES = ['DO_IT_', 'JIRA_', 'GITHUB_'];
const SECRET_KEY = /(TOKEN|SECRET|PASSWORD|PASSWD|API_KEY)$/;
// A shell command the hooks run, and the host that receives the Jira token.
export const GUARDED_KEYS = ['DO_IT_LINT_CMD', 'JIRA_BASE_URL'];

export function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    // A quoted value may be followed by an inline comment: A="x" # note.
    const quoted = m[2].match(/^(["'])(.*?)\1\s*(?:#.*)?$/);
    out[m[1]] = quoted ? quoted[2] : m[2].replace(/\s+#.*$/, '');
  }
  return out;
}

export function findRepoRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

export function configFiles(root, env = process.env) {
  const xdg = env.XDG_CONFIG_HOME || path.join(env.HOME || os.homedir(), '.config');
  return [
    { scope: 'user', file: path.join(xdg, 'do-it', 'config.env') },
    { scope: 'project', file: path.join(root, '.do-it', 'config.env') },
    { scope: 'local', file: path.join(root, '.do-it', 'local.env') },
  ];
}

export function loadConfig({ cwd = process.cwd(), env = process.env } = {}) {
  const root = findRepoRoot(cwd);
  const values = { ...DEFAULTS };
  const sources = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, 'default']));
  const warnings = [];
  const repoGuarded = {};
  const repoSources = {};

  for (const { scope, file } of configFiles(root, env)) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const [key, value] of Object.entries(parseEnv(text))) {
      // An empty value runs nothing and sends nothing, so it needs no trust.
      if (scope !== 'user' && GUARDED_KEYS.includes(key) && value) {
        repoGuarded[key] = value;
        repoSources[key] = file;
        continue;
      }
      if (GUARDED_KEYS.includes(key)) {
        delete repoGuarded[key];
        delete repoSources[key];
      }
      values[key] = value;
      sources[key] = file;
      if (scope === 'project' && SECRET_KEY.test(key) && value) {
        warnings.push(`${key} is set in ${file}, which is committed. Move it to .do-it/local.env or the user config.`);
      }
    }
  }

  const trustState = { file: trustFile(env), hash: guardedHash(repoGuarded), values: repoGuarded, root };
  let untrusted = [];
  if (Object.keys(repoGuarded).length) {
    if (trustedHashes(trustState.file).has(trustState.hash)) {
      Object.assign(values, repoGuarded);
      Object.assign(sources, repoSources);
    } else {
      untrusted = Object.keys(repoGuarded).sort();
    }
  }

  for (const [key, value] of Object.entries(env)) {
    if (ENV_PREFIXES.some((p) => key.startsWith(p)) && value !== undefined) {
      values[key] = value;
      sources[key] = 'env';
      untrusted = untrusted.filter((k) => k !== key);
    }
  }

  if (untrusted.length) {
    warnings.push(
      `${untrusted.join(', ')} from the repo's .do-it files ${untrusted.length > 1 ? 'are' : 'is'} not trusted on this machine and ${untrusted.length > 1 ? 'were' : 'was'} ignored. ` +
        'Review the values, then run tracker.mjs trust (track-it skill) to apply them.',
    );
  }

  return { root, values, sources, warnings, untrusted, trust: trustState };
}

function trustFile(env) {
  const xdg = env.XDG_CONFIG_HOME || path.join(env.HOME || os.homedir(), '.config');
  return path.join(xdg, 'do-it', 'trusted');
}

// The values only, no path: every clone and worktree with the same values
// shares one trust, and any changed value needs trusting again.
export function guardedHash(guarded) {
  const lines = Object.keys(guarded).sort().map((k) => `${k}=${guarded[k]}\n`).join('');
  return crypto.createHash('sha256').update(lines).digest('hex');
}

function trustedHashes(file) {
  try {
    return new Set(fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.split(' ')[0]).filter(Boolean));
  } catch {
    return new Set();
  }
}

// Pin the repo's current guarded values for this user. Returns what was trusted.
export function trust(config) {
  const { file, hash, values, root } = config.trust;
  if (!Object.keys(values).length) return {};
  if (!trustedHashes(file).has(hash)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${hash} ${root}\n`, { mode: 0o600 });
  }
  return values;
}

// Project docs: skills name the defaults (CONTEXT.md, CHANGELOG.md, docs/adr/,
// docs/reference/); repos differ. A configured path wins (`alias` is an older
// key read when the main one is unset), then the first candidate that exists,
// then the default (marked missing). GLOSSARY files come last (ADR 0005).
export const DOC_CANDIDATES = {
  context: {
    key: 'DO_IT_CONTEXT',
    alias: 'DO_IT_GLOSSARY',
    candidates: ['CONTEXT.md', 'docs/CONTEXT.md', 'GLOSSARY.md', 'docs/GLOSSARY.md', 'docs/glossary.md'],
    fallback: 'CONTEXT.md',
  },
  contextMap: {
    key: 'DO_IT_CONTEXT_MAP',
    candidates: ['CONTEXT-MAP.md', 'docs/CONTEXT-MAP.md', 'GLOSSARY-MAP.md'],
    fallback: 'CONTEXT-MAP.md',
  },
  changelog: {
    key: 'DO_IT_CHANGELOG',
    candidates: ['CHANGELOG.md', 'docs/CHANGELOG.md', 'docs/changelog.md', 'CHANGES.md', 'HISTORY.md', '.changeset'],
    fallback: null,
  },
  adrDir: {
    key: 'DO_IT_ADR_DIR',
    candidates: ['docs/adr', 'docs/decisions', 'docs/architecture/decisions', 'doc/adr', 'adr'],
    fallback: 'docs/adr',
  },
  referenceDir: {
    key: 'DO_IT_REFERENCE_DIR',
    candidates: ['docs/reference'],
    fallback: 'docs/reference',
  },
  todo: {
    key: 'DO_IT_TODO_FILE',
    candidates: ['docs/TODO.md', 'TODO.md', 'docs/todo.md'],
    fallback: 'docs/TODO.md',
  },
  roadmapDir: {
    key: 'DO_IT_ROADMAP_DIR',
    candidates: ['docs/roadmap', 'docs/roadmaps'],
    fallback: 'docs/roadmap',
  },
  researchDir: {
    key: 'DO_IT_RESEARCH_DIR',
    candidates: ['docs/research'],
    fallback: 'docs/research',
  },
};

export function resolveDocs(root, values = DEFAULTS) {
  const out = {};
  for (const [name, { key, alias, candidates, fallback }] of Object.entries(DOC_CANDIDATES)) {
    const configured = values[key] || (alias && values[alias]);
    if (configured) {
      out[name] = { path: configured, exists: fs.existsSync(path.resolve(root, configured)), source: 'config' };
      continue;
    }
    const found = candidates.find((c) => fs.existsSync(path.join(root, c)));
    out[name] = found
      ? { path: found, exists: true, source: 'detected' }
      : { path: fallback, exists: false, source: 'default' };
  }
  return out;
}

// Mask the password in any URL with userinfo, keeping the user and host.
export function maskUrlCredentials(text) {
  return String(text).replace(/([a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:)[^/\s@]+@/gi, '$1***@');
}

export function redact(values) {
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, SECRET_KEY.test(k) && v ? '***' : typeof v === 'string' ? maskUrlCredentials(v) : v]),
  );
}

export function isOn(value) {
  return /^(1|true|on|yes)$/i.test(String(value || '').trim());
}
