// Jira tracker over REST API v2 (Server, Data Center and Cloud all accept it).
// Auth: JIRA_AUTH=bearer (personal access token, the Data Center default) or
// basic (JIRA_EMAIL + JIRA_API_TOKEN, Cloud). Unset: basic when JIRA_EMAIL is
// set, else bearer.

import { markdownToWiki } from '../wiki.mjs';
import { parseRef } from '../refs.mjs';

export function jiraTracker(cfg, { fetch: fetchImpl = globalThis.fetch } = {}) {
  const base = cfg.JIRA_BASE_URL.replace(/\/+$/, '');
  // A blank config value is unset, like a blank flag.
  const defaultEpic = String(cfg.JIRA_DEFAULT_EPIC || '').trim();

  function need(...keys) {
    const missing = keys.filter((k) => !cfg[k]);
    if (missing.length) throw new Error(`Jira config missing: ${missing.join(', ')}. Run: tracker.mjs config`);
  }

  function authMode() {
    return String(cfg.JIRA_AUTH || (cfg.JIRA_EMAIL ? 'basic' : 'bearer')).trim().toLowerCase();
  }

  function authHeader() {
    if (authMode() === 'basic') {
      need('JIRA_EMAIL');
      return `Basic ${Buffer.from(`${cfg.JIRA_EMAIL}:${cfg.JIRA_API_TOKEN}`).toString('base64')}`;
    }
    return `Bearer ${cfg.JIRA_API_TOKEN}`;
  }

  async function api(method, pathname, body) {
    need('JIRA_BASE_URL', 'JIRA_API_TOKEN');
    // Never put the URL itself in this message: it is the thing that leaks.
    if (/^[a-z][a-z0-9+.-]*:\/\/[^/]*@/i.test(base)) {
      throw new Error('JIRA_BASE_URL must not contain credentials; set JIRA_EMAIL and JIRA_API_TOKEN instead');
    }
    const headers = { Authorization: authHeader(), Accept: 'application/json', 'Content-Type': 'application/json' };
    let res;
    try {
      res = await fetchImpl(`${base}/rest/api/2${pathname}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      // fetch may quote a malformed header value, token included: name only the cause.
      throw new Error(`Jira ${method} ${pathname}: request failed (${e.cause?.code || e.name})`);
    }
    const text = await res.text();
    if (!res.ok) {
      // An error page may echo the request's Authorization header back. Mask
      // the longest secret first, so a token inside the basic value cannot
      // break that value before it is masked.
      let shown = text;
      const secrets = [authHeader().split(' ')[1], cfg.JIRA_API_TOKEN].filter(Boolean).sort((a, b) => b.length - a.length);
      for (const s of secrets) shown = shown.split(s).join('***');
      throw new Error(`Jira ${method} ${pathname}: ${res.status} ${shown.slice(0, 300)}`);
    }
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      // A proxy or sign-in page: say so without quoting it.
      throw new Error(`Jira ${method} ${pathname}: ${res.status} response is not JSON`);
    }
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

  // The project's components, fetched once per project; a 404 names the key.
  const projects = new Map();
  async function projectComponents(projectKey) {
    if (!projects.has(projectKey)) {
      let data;
      try {
        data = await api('GET', `/project/${encodeURIComponent(projectKey)}`);
      } catch (e) {
        throw new Error(`Jira project ${projectKey} not found or not visible: ${e.message}`);
      }
      projects.set(projectKey, (data.components || []).map((c) => c.name));
    }
    return projects.get(projectKey);
  }

  // Flag values, else the config value, as a list; '' is unset.
  const listOf = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((s) => String(s ?? '').trim()).filter(Boolean);
  // 'none' is a deliberate skip of that field's check.
  // shortcut: JIRA_COMPONENTS and JIRA_DEFAULT_EPIC are not trust-guarded, so a
  // repo's own config can set 'none'; guard them (ADR 0006) if a repo ever
  // must not be able to skip the checks.
  const isNone = (v) => String(v || '').trim().toLowerCase() === 'none';

  // Every issue settles its project, components and epic or parent before it
  // is created, unless the caller passes 'none' for one. An epic itself has
  // no epic.
  async function create({ title, type, body = '', epic: e, parent: p, components, project, labels = [], issueType }) {
    // A blank value is unset, like an empty one.
    const epic = String(e || '').trim();
    const parent = String(p || '').trim();
    const projectKey = String(project || '').trim() || cfg.JIRA_PROJECT_KEY;
    if (!projectKey) need('JIRA_PROJECT_KEY');
    const isEpic = issueType === cfg.JIRA_EPIC_TYPE;
    const wanted = listOf(components?.length ? components : cfg.JIRA_COMPONENTS);
    const skipComponents = wanted.length === 1 && isNone(wanted[0]);
    if (wanted.some(isNone) && !skipComponents) throw new Error('Jira components: "none" cannot be mixed with component names');
    if (!wanted.length) {
      throw new Error('Jira create needs a component: pass --component <name> (repeatable), set JIRA_COMPONENTS, or pass --component none');
    }
    if (epic && parent) throw new Error('Jira create takes --epic or --parent, not both');
    const parentKey = isNone(parent) ? '' : parent;
    const skipEpic = isNone(parent) || isNone(epic) || (!epic && !parent && isNone(defaultEpic));
    const epicKey = parentKey || isEpic || skipEpic ? '' : epic || defaultEpic;
    if (!parentKey && !isEpic && !skipEpic && !epicKey) {
      throw new Error('Jira create needs an epic or parent: pass --epic <key>, --parent <key>, set JIRA_DEFAULT_EPIC, or pass --epic none');
    }
    const available = await projectComponents(projectKey);
    const named = [];
    if (!skipComponents) {
      for (const c of wanted) {
        const match = available.find((a) => a.toLowerCase() === c.toLowerCase());
        if (!match) throw new Error(`Jira project ${projectKey}: unknown component "${c}"; available: ${available.join(', ') || 'none'}`);
        named.push({ name: match });
      }
    }
    const fields = {
      project: { key: projectKey },
      summary: title,
      description: markdownToWiki(body),
      issuetype: { name: issueType || (parentKey ? cfg.JIRA_SUBTASK_TYPE : type === 'bug' ? 'Bug' : cfg.JIRA_ISSUE_TYPE) },
    };
    if (labels.length) fields.labels = labels;
    if (named.length) fields.components = named;
    if (isEpic && cfg.JIRA_EPIC_NAME_FIELD) fields[cfg.JIRA_EPIC_NAME_FIELD] = title;
    if (parentKey) fields.parent = { key: parentKey };
    else if (epicKey) {
      if (cfg.JIRA_EPIC_LINK_FIELD) fields[cfg.JIRA_EPIC_LINK_FIELD] = epicKey;
      else fields.parent = { key: epicKey };
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

    // An epic of 'none' files the phases with no epic, and creates none.
    async publish({ title, body = '', phases = [], parent, components, project }) {
      let epic = String(parent || '').trim() || defaultEpic;
      let url;
      if (!epic) {
        const created = await create({ title, body, components, project, issueType: cfg.JIRA_EPIC_TYPE });
        epic = created.ref;
        url = created.url;
      }
      const children = {};
      for (const p of phases) {
        children[p.n] = (await create({ title: `${title}: ${p.title}`, body: p.body || '', components, project, epic })).ref;
      }
      if (isNone(epic)) return { parent: null, phases: children };
      return { parent: epic, url: url || `${base}/browse/${epic}`, phases: children };
    },
  };
}
