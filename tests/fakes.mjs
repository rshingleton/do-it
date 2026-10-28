// The two seams the tracker adapters take: `fetch` (Jira) and the gh runner
// (GitHub). One definition of each, so a suite does not grow its own.

// A fetch response. A string body goes out as written, anything else as JSON.
export const reply = (body, status = 200) => ({
  ok: status < 400,
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

// A fetch that records each request and answers with `handler(url, init)`:
// a ready `reply(...)`, or plain data wrapped as a 200. Throwing from the
// handler is how a test makes the network fail.
export function fakeFetch(handler = () => ({})) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    calls.push({ url, path, method: init.method, auth: init.headers?.Authorization, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const out = await handler(url, init);
    return typeof out?.ok === 'boolean' ? out : reply(out);
  };
  fetch.calls = calls;
  return fetch;
}

// A gh that records its arguments and the text piped to it, and returns
// `answer(args)`. Throwing from `answer` is how a test makes gh fail.
export function fakeGh(answer = () => '') {
  const calls = [];
  const run = (args, input) => {
    calls.push({ args, input });
    return answer(args);
  };
  return { run, calls };
}
