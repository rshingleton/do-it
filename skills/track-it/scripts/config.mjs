// do-it configuration: layered dotenv files, then the process environment.
//
// Precedence, lowest first:
//   1. built-in defaults
//   2. $XDG_CONFIG_HOME/do-it/config.env   (user defaults; may hold secrets)
//   3. <repo>/.do-it/config.env            (project, committed; no secrets)
//   4. <repo>/.do-it/local.env             (project, gitignored; may hold secrets)
//   5. process environment                 (DO_IT_*, JIRA_*, GITHUB_* only)
//
// Shared by the tracker CLI, the Claude Code hooks and the OpenCode plugin.

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
  DO_IT_GLOSSARY: '',
  DO_IT_CHANGELOG: '',
  DO_IT_ADR_DIR: '',
  DO_IT_REFERENCE_DIR: '',
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
  JIRA_EPIC_LINK_FIELD: '',
  JIRA_EPIC_NAME_FIELD: '',
  JIRA_ASSIGNEE: '',
  JIRA_START_TRANSITION: 'In Progress',
  JIRA_DONE_TRANSITION: 'Done',
};

const ENV_PREFIXES = ['DO_IT_', 'JIRA_', 'GITHUB_'];
const SECRET_KEY = /(TOKEN|SECRET|PASSWORD|PASSWD|API_KEY)$/;

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

  for (const { scope, file } of configFiles(root, env)) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const [key, value] of Object.entries(parseEnv(text))) {
      values[key] = value;
      sources[key] = file;
      if (scope === 'project' && SECRET_KEY.test(key) && value) {
        warnings.push(`${key} is set in ${file}, which is committed. Move it to .do-it/local.env or the user config.`);
      }
    }
  }

  for (const [key, value] of Object.entries(env)) {
    if (ENV_PREFIXES.some((p) => key.startsWith(p)) && value !== undefined) {
      values[key] = value;
      sources[key] = 'env';
    }
  }

  return { root, values, sources, warnings };
}

// Project docs: skills name the defaults (GLOSSARY.md, CHANGELOG.md, docs/adr/,
// docs/reference/); repos differ. A configured path wins, then the first
// candidate that exists, then the default (marked missing).
export const DOC_CANDIDATES = {
  glossary: {
    key: 'DO_IT_GLOSSARY',
    candidates: ['GLOSSARY.md', 'CONTEXT.md', 'docs/GLOSSARY.md', 'docs/CONTEXT.md', 'docs/glossary.md'],
    fallback: 'GLOSSARY.md',
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
};

export function resolveDocs(root, values = DEFAULTS) {
  const out = {};
  for (const [name, { key, candidates, fallback }] of Object.entries(DOC_CANDIDATES)) {
    const configured = values[key];
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
