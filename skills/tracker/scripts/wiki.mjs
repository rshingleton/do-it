// Markdown to Jira wiki markup, for the subset do-it writes: headings,
// bullets, numbered lists, fenced code, inline code, bold, italics, links.
// Jira's REST API v2 takes wiki markup on Server, Data Center and Cloud.

export function markdownToWiki(md) {
  const out = [];
  let inCode = false;
  for (const line of String(md).split(/\r?\n/)) {
    const fence = line.match(/^```\s*([\w+-]*)\s*$/);
    if (fence) {
      if (inCode) out.push('{code}');
      else out.push(fence[1] ? `{code:${fence[1]}}` : '{code}');
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(line);
      continue;
    }
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      out.push(`h${m[1].length}. ${inline(m[2])}`);
    } else if ((m = line.match(/^(\s*)[-*]\s+(.*)$/))) {
      out.push(`${'*'.repeat(Math.floor(m[1].length / 2) + 1)} ${inline(m[2])}`);
    } else if ((m = line.match(/^(\s*)\d+\.\s+(.*)$/))) {
      out.push(`${'#'.repeat(Math.floor(m[1].length / 2) + 1)} ${inline(m[2])}`);
    } else {
      out.push(inline(line));
    }
  }
  if (inCode) out.push('{code}');
  return out.join('\n');
}

function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '[$1|$2]')
    .replace(/\*\*([^*]+)\*\*/g, '\u0001$1\u0001')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\*)/g, '$1_$2_')
    .replace(/\u0001/g, '*');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `{{${codes[Number(i)]}}}`);
}
