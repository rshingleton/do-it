// The voice block (skills/it-core/VOICE.md) copied into each agent file
// between markers, so a host without hooks still delivers it.

const START = '<!-- voice:start -->';
const END = '<!-- voice:end -->';

// text with the marked span set to voice: replaced in place, else appended.
export function withVoice(text, voice) {
  const block = `${START}\n${voice.trim()}\n${END}`;
  const re = new RegExp(`${START}[\\s\\S]*?${END}`);
  return re.test(text) ? text.replace(re, () => block) : `${text.replace(/\s+$/, '')}\n\n${block}\n`;
}
