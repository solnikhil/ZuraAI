const fs = require('fs');
const p = 'C:/Users/Nikhil/AppData/Roaming/zura/debug-sessions/53870a83-07be-4a95-9f92-d0f0273a734c.jsonl';
const raw = fs.readFileSync(p, 'utf8');
const lines = raw.trim().split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

console.log('Total diagnostic events:', lines.length);
console.log('\n=== ROUND PROGRESSION + RESEARCH STATE (key events) ===\n');

const events = [];
lines.forEach(e => {
  const ph = e.phase || '';
  if (['round-start', 'round-finish', 'research-state', 'tool-start', 'tool-complete', 'finish'].includes(ph)) {
    events.push(e);
  }
});

events.forEach(e => {
  const ts = new Date(e.timestamp).toISOString().slice(11, 23);
  let s = ts + ' r=' + (e.round ?? '?') + ' ' + e.phase;
  if (e.roundType) s += ' [' + e.roundType + ']';
  if (e.researchState) s += ' state=' + e.researchState;
  if (e.tool) s += ' ' + e.tool.name + (e.tool.success ? ':ok' : ':start');
  if (e.finishReason) s += ' finish=' + e.finishReason;
  if (e.usage && e.phase.includes('finish')) {
    s += ' tokens=' + (e.usage.totalTokens || 0);
  }
  console.log(s);
});

console.log('\n=== SEARCH FOR HARD CAP / BUDGET / LOOP LIMIT MENTIONS ===');
let found = false;
lines.forEach(e => {
  const str = JSON.stringify(e);
  const low = str.toLowerCase();
  if (low.includes('cap') || low.includes('limit') || low.includes('"max"') || low.includes('budget') || low.includes('exhaust') || (low.includes('search') && low.includes('stop'))) {
    console.log('POSSIBLE LIMIT @ r=' + (e.round ?? '?') + ':', str.slice(0, 450));
    found = true;
  }
});
if (!found) console.log('No direct cap/budget text found in events.');

// Show research-state changes and the last few rounds in detail
console.log('\n=== ALL RESEARCH-STATE CHANGES ===');
lines.filter(e => e.phase === 'research-state').forEach(e => {
  console.log(new Date(e.timestamp).toISOString().slice(11,23), 'r='+(e.round??'?'), 'state=' + e.researchState, 'leaked=' + (e.leakedMarkupFormat||''));
});

console.log('\n=== STREAM CHUNKS CONTAINING tool_calls IN LATE ROUNDS ===');
lines.filter(e => e.phase === 'stream-chunk' && e.streamChunk && /tool_call|web_search|invoke/i.test(JSON.stringify(e.streamChunk))).slice(-10).forEach(e => {
  console.log('r='+(e.round??'?'), 'chunk:', JSON.stringify(e.streamChunk).slice(0,200));
});
