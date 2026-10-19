// Jira tracker over REST API v2 (Server, Data Center and Cloud all accept it).
// Auth: JIRA_AUTH=bearer (personal access token, the Data Center default) or
// basic (JIRA_EMAIL + JIRA_API_TOKEN, Cloud). Unset: basic when JIRA_EMAIL is
// set, else bearer.

import { markdownToWiki } from '../wiki.mjs';
import { parseRef } from '../refs.mjs';

export function jiraTracker(cfg, { fetch: fetchImpl = globalThis.fetch } = {}) {
  const base = cfg.JIRA_BASE_URL.replace(/\/+$/, '');

  function need(...keys) {
    const missing = keys.filter((k) => !cfg[k]);
    if (missing.length) throw new Error(`Jira config missing: ${missing.join(', ')}. Run: tracker.mjs config`);
  }

  function authMode() {
    return cfg.JIRA_AUTH || (cfg.JIRA_EMAIL ? 'basic' : 'bearer');
  }

  function authHeader() {
    if (authMode() === 'basic') {
      return `Basic ${Buffer.from(`${cfg.JIRA_EMAIL}:${cfg.JIRA_API_TOKEN}`).toString('base64')}`;
    }
    return `Bearer ${cfg.JIRA_API_TOKEN}`;
  }

  async function api(method, pathname, body) {
    need('JIRA_BASE_URL', 'JIRA_API_TOKEN');
    const res = await fetchImpl(`${base}/rest/api/2${pathname}`, {
      method,
      headers: { Authorization: authHeader(), Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Jira ${method} ${pathname}: ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  }

  function key(ref) {
    const r = parseRef(ref);
    if (!r || r.kind !== 'jira') throw new Error(`not a Jira key: ${ref}`);
    return r.key;
  }

  async function transition(issueKey, name) {
    const { transitions = [] } = await api('GET', `/issue/${issueKey}/transitions`);
    const wanted = name.toLowerCase();
    const t = transitions.find((x) => x.name.toLowerCase() === wanted || x.to?.name?.toLowerCase() === wanted);
    if (!t) {
      return { ref: issueKey, skipped: `no transition "${name}"; available: ${transitions.map((x) => x.name).join(', ')}` };
    }
    await api('POST', `/issue/${issueKey}/transitions`, { transition: { id: t.id } });
    return { ref: issueKey, status: t.to?.name || name };
  }

  async function create({ title, type, body = '', epic, labels = [], issueType }) {
    need('JIRA_PROJECT_KEY');
    const fields = {
      project: { key: cfg.JIRA_PROJECT_KEY },
      summary: title,
      description: markdownToWiki(body),
      issuetype: { name: issueType || (type === 'bug' ? 'Bug' : cfg.JIRA_ISSUE_TYPE) },
    };
    if (labels.length) fields.labels = labels;
    if (issueType === cfg.JIRA_EPIC_TYPE && cfg.JIRA_EPIC_NAME_FIELD) fields[cfg.JIRA_EPIC_NAME_FIELD] = title;
    if (epic) {
      if (cfg.JIRA_EPIC_LINK_FIELD) fields[cfg.JIRA_EPIC_LINK_FIELD] = epic;
      else fields.parent = { key: epic };
    }
    const created = await api('POST', '/issue', { fields });
    return { ref: created.key, url: `${base}/browse/${created.key}` };
  }

  return {
    kind: 'jira',
    create,

    async get(ref) {
      const k = key(ref);
      const data = await api('GET', `/issue/${k}?fields=summary,description,status,issuetype,assignee,comment`);
      return {
        ref: k,
        url: `${base}/browse/${k}`,
        title: data.fields?.summary,
        status: data.fields?.status?.name,
        type: data.fields?.issuetype?.name,
        assignee: data.fields?.assignee?.name || data.fields?.assignee?.displayName || null,
        body: data.fields?.description || '',
        comments: (data.fields?.comment?.comments || []).map((c) => ({ author: c.author?.displayName, body: c.body })),
      };
    },

    async comment(ref, text) {
      const k = key(ref);
      await api('POST', `/issue/${k}/comment`, { body: markdownToWiki(text) });
      return { ref: k };
    },

    async start(ref) {
      const k = key(ref);
      if (cfg.JIRA_ASSIGNEE) {
        const data = await api('GET', `/issue/${k}?fields=assignee`);
        // Data Center assigns by username; Cloud (basic auth) by accountId.
        const who = authMode() === 'basic' ? { accountId: cfg.JIRA_ASSIGNEE } : { name: cfg.JIRA_ASSIGNEE };
        if (!data.fields?.assignee) await api('PUT', `/issue/${k}/assignee`, who);
      }
      return transition(k, cfg.JIRA_START_TRANSITION);
    },

    async close(ref, text) {
      const k = key(ref);
      if (text) await api('POST', `/issue/${k}/comment`, { body: markdownToWiki(text) });
      return transition(k, cfg.JIRA_DONE_TRANSITION);
    },

    async publish({ title, body = '', phases = [], parent }) {
      let epic = parent || cfg.JIRA_DEFAULT_EPIC;
      let url;
      if (!epic) {
        const created = await create({ title, body, issueType: cfg.JIRA_EPIC_TYPE });
        epic = created.ref;
        url = created.url;
      }
      const children = {};
      for (const p of phases) {
        children[p.n] = (await create({ title: `${title}: ${p.title}`, body: p.body || '', epic })).ref;
      }
      return { parent: epic, url: url || `${base}/browse/${epic}`, phases: children };
    },
  };
}
