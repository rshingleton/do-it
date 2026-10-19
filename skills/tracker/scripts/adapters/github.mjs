// GitHub tracker through the `gh` CLI, so auth is whatever `gh auth` holds.

import { execFileSync } from 'node:child_process';
import { parseRef } from '../refs.mjs';

export function defaultRunner(args, input) {
  return execFileSync('gh', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

export function githubTracker(cfg, { run = defaultRunner } = {}) {
  const repoArgs = (repo) => (repo || cfg.DO_IT_GITHUB_REPO ? ['-R', repo || cfg.DO_IT_GITHUB_REPO] : []);

  function target(ref) {
    const r = typeof ref === 'object' ? ref : parseRef(ref);
    if (!r || r.kind !== 'github') throw new Error(`not a GitHub ref: ${ref}`);
    return { n: String(r.number), repo: repoArgs(r.repo) };
  }

  function create({ title, type, body = '', labels = [] }) {
    const all = [...labels, ...(type ? [type] : [])];
    const args = ['issue', 'create', ...repoArgs(), '--title', title, '--body-file', '-'];
    for (const l of all) args.push('--label', l);
    let url;
    try {
      url = run(args, body).trim();
    } catch (e) {
      // A missing label is the usual failure; retry without labels rather than fail intake.
      if (!all.length) throw e;
      url = run(['issue', 'create', ...repoArgs(), '--title', title, '--body-file', '-'], body).trim();
    }
    const number = Number(url.match(/\/issues\/(\d+)/)?.[1]);
    return { ref: `#${number}`, number, url };
  }

  return {
    kind: 'github',
    create,

    get(ref) {
      const { n, repo } = target(ref);
      const data = JSON.parse(run(['issue', 'view', n, ...repo, '--json', 'number,title,body,state,url,labels,comments']));
      return {
        ref: `#${data.number}`,
        title: data.title,
        status: data.state,
        url: data.url,
        body: data.body,
        labels: (data.labels || []).map((l) => l.name),
        comments: (data.comments || []).map((c) => ({ author: c.author?.login, body: c.body })),
      };
    },

    comment(ref, text) {
      const { n, repo } = target(ref);
      run(['issue', 'comment', n, ...repo, '--body-file', '-'], text);
      return { ref };
    },

    start(ref) {
      if (!cfg.DO_IT_GITHUB_START_LABEL) return { ref, skipped: 'no DO_IT_GITHUB_START_LABEL' };
      const { n, repo } = target(ref);
      run(['issue', 'edit', n, ...repo, '--add-label', cfg.DO_IT_GITHUB_START_LABEL]);
      return { ref };
    },

    close(ref, text) {
      const { n, repo } = target(ref);
      run(['issue', 'close', n, ...repo, ...(text ? ['--comment', text] : [])]);
      return { ref, status: 'closed' };
    },

    publish({ title, body = '', phases = [] }) {
      const children = {};
      for (const p of phases) {
        children[p.n] = create({ title: `${title}: phase ${p.n} ${p.title}`, body: p.body || '' }).ref;
      }
      const list = phases.map((p) => `- [ ] ${children[p.n]} phase ${p.n}: ${p.title}`).join('\n');
      const parent = create({ title, body: `${body}\n\n## Phases\n\n${list}\n` });
      return { parent: parent.ref, url: parent.url, phases: children };
    },
  };
}
