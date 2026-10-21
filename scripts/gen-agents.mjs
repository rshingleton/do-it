#!/usr/bin/env node
// Copy skills/it-core/VOICE.md into every agents/*.md between voice markers.
// npm run check fails an agent whose copy is missing or stale.

import fs from 'node:fs';
import { listAgents } from './lib/skills.mjs';
import { withVoice } from './lib/voice.mjs';
import { VOICE_FILE } from '../hooks/lib/context.mjs';

const voice = fs.readFileSync(VOICE_FILE, 'utf8');
let wrote = 0;
for (const a of listAgents()) {
  const next = withVoice(a.text, voice);
  if (next !== a.text) {
    fs.writeFileSync(a.file, next);
    wrote++;
  }
}
console.log(`Voice block: wrote ${wrote} agent file(s).`);
