import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { transcriptBrainRoot } from './transcript.mjs';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_EXPORT_IDS = 50;
const MAX_LIST_ITEMS = 60;

const contains = (root, file) => {
  const rel = relative(root, file);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
};

export function defaultExportDir() {
  return join(homedir(), 'Documents', 'antigravity-exports');
}

export function resolveOutputDir(raw) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return defaultExportDir();
  const trimmed = raw.trim();
  const expanded = trimmed === '~'
    ? homedir()
    : trimmed.startsWith('~/') || trimmed.startsWith('~\\')
      ? join(homedir(), trimmed.slice(2))
      : trimmed;
  if (!isAbsolute(expanded)) throw new Error('Export directory must be an absolute path');
  return resolve(expanded);
}

export async function locateTranscript(id, root = transcriptBrainRoot()) {
  if (!GUID.test(id || '')) return null;
  let realRoot;
  try {
    realRoot = await realpath(root);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const normalizedId = id.toLowerCase();
  for (const name of ['transcript_full.jsonl', 'transcript.jsonl']) {
    const candidate = join(root, normalizedId, '.system_generated', 'logs', name);
    try {
      const file = await realpath(candidate);
      const expected = join(realRoot, normalizedId, '.system_generated', 'logs', name);
      const norm = p => (process.platform === 'win32' ? p.toLowerCase() : p);
      if (!contains(realRoot, file) || norm(file) !== norm(expected)) return null;
      const info = await stat(file);
      if (!info.isFile()) return null;
      return { file, size: info.size, mtimeMs: info.mtimeMs, kind: name === 'transcript_full.jsonl' ? 'full' : 'compact' };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return null;
}

export function cleanUserText(raw) {
  if (typeof raw !== 'string') return '';
  let text = raw.trim();
  const reqMatch = text.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/);
  if (reqMatch) {
    text = reqMatch[1].trim();
  } else {
    text = text.replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/g, '').trim();
  }
  return text;
}

async function fallbackTitleFromFile(file) {
  try {
    const chunk = (await readFile(file, 'utf8')).slice(0, 65536);
    for (const line of chunk.split('\n')) {
      if (!line.trim()) continue;
      let record;
      try { record = JSON.parse(line); } catch { continue; }
      if (record.type === 'USER_INPUT' && typeof record.content === 'string') {
        const cleaned = cleanUserText(record.content).replace(/\s+/g, ' ').trim();
        if (cleaned) return cleaned.slice(0, 72);
      }
    }
  } catch {}
  return null;
}

export async function listExportableConversations({ summaries = [], currentId = null, root = transcriptBrainRoot(), limit = MAX_LIST_ITEMS } = {}) {
  const summaryMap = new Map();
  for (const item of summaries || []) {
    if (item?.id && GUID.test(item.id)) summaryMap.set(item.id.toLowerCase(), item);
  }
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const normalizedCurrent = GUID.test(currentId || '') ? currentId.toLowerCase() : null;
  const located = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !GUID.test(entry.name)) continue;
    const id = entry.name.toLowerCase();
    const hit = await locateTranscript(id, root);
    if (!hit) continue;
    const summary = summaryMap.get(id);
    const modifiedAt = summary?.modifiedAt || new Date(hit.mtimeMs).toISOString();
    const sortTime = Math.max(hit.mtimeMs, Number.isFinite(Date.parse(modifiedAt)) ? Date.parse(modifiedAt) : 0);
    located.push({
      id,
      file: hit.file,
      title: summary?.title || null,
      modifiedAt,
      sortTime,
      size: hit.size,
      kind: hit.kind,
      stepCount: Number.isSafeInteger(summary?.stepCount) ? summary.stepCount : null,
      current: id === normalizedCurrent,
    });
  }

  located.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    return b.sortTime - a.sortTime;
  });

  const sliced = located.slice(0, Math.max(1, limit));
  const result = [];
  for (const item of sliced) {
    const title = item.title || (await fallbackTitleFromFile(item.file)) || item.id.slice(0, 8);
    result.push({
      id: item.id,
      title,
      modifiedAt: item.modifiedAt,
      size: item.size,
      kind: item.kind,
      stepCount: item.stepCount,
      current: item.current,
    });
  }
  return result;
}

export async function parseTranscript(file) {
  const raw = await readFile(file, 'utf8');
  const byIndex = new Map();
  let fallbackIndex = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let record;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!record || typeof record !== 'object') continue;
    const key = Number.isSafeInteger(record.step_index) && record.step_index >= 0
      ? record.step_index
      : 1_000_000_000 + fallbackIndex++;
    byIndex.set(key, record);
  }
  return [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, rec]) => rec);
}

function escapeSummary(text) {
  return String(text || '').replace(/[<>&]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]));
}

function fenceBlock(text, lang = '') {
  const value = String(text ?? '');
  let maxRun = 2;
  for (const match of value.matchAll(/`+/g)) {
    if (match[0].length > maxRun) maxRun = match[0].length;
  }
  const fence = '`'.repeat(maxRun + 1);
  return `${fence}${lang}\n${value}\n${fence}`;
}

function formatToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls) || !toolCalls.length) return '';
  const blocks = toolCalls.map((call, idx) => {
    const name = call?.name || `tool_${idx + 1}`;
    const args = call?.args !== undefined ? JSON.stringify(call.args, null, 2) : '';
    return args ? `**${name}**\n\n${fenceBlock(args, 'json')}` : `**${name}**`;
  });
  return `<details>\n<summary>Tool calls (${toolCalls.length})</summary>\n\n${blocks.join('\n\n')}\n\n</details>`;
}

function formatMedia(media) {
  if (!Array.isArray(media) || !media.length) return '';
  const lines = media
    .filter(item => item && typeof item.uri === 'string')
    .map(item => `- Attachment (${item.mime_type || 'file'}): \`${item.uri}\``);
  return lines.length ? lines.join('\n') : '';
}

function normalizeType(value) {
  return typeof value === 'string' ? value.replace(/^CORTEX_STEP_TYPE_/, '') : '';
}

export function filterRecords(records, { includeThinking = false, includeTools = false, includeSystem = false } = {}) {
  const out = [];
  for (const rec of records) {
    const type = normalizeType(rec.type);
    if (type === 'USER_INPUT') {
      out.push(rec);
    } else if (type === 'PLANNER_RESPONSE') {
      const hasContent = typeof rec.content === 'string' && rec.content.trim().length > 0;
      const hasThinking = includeThinking && typeof rec.thinking === 'string' && rec.thinking.trim().length > 0;
      const hasTools = includeTools && Array.isArray(rec.tool_calls) && rec.tool_calls.length > 0;
      const hasMedia = Array.isArray(rec.media) && rec.media.length > 0;
      if (hasContent || hasThinking || hasTools || hasMedia) {
        const clone = { ...rec };
        if (!includeThinking) delete clone.thinking;
        if (!includeTools) delete clone.tool_calls;
        out.push(clone);
      }
    } else if (type === 'GENERIC' || type === 'TOOL_RESULT' || type === 'TOOL_OUTPUT') {
      if (includeTools) out.push(rec);
    } else if (includeSystem) {
      out.push(rec);
    }
  }
  return out;
}

export function formatTranscriptMarkdown(records, {
  title = 'Conversation Export',
  conversationId = '',
  includeThinking = false,
  includeTools = false,
  includeSystem = false,
} = {}) {
  const filtered = filterRecords(records, { includeThinking, includeTools, includeSystem });
  const lines = [
    `# ${title || conversationId || 'Conversation Export'}`,
    '',
    `- **Conversation ID**: \`${conversationId}\``,
    `- **Exported At**: ${new Date().toISOString()}`,
    `- **Steps Included**: ${filtered.length} / ${records.length}`,
    '',
    '---',
    '',
  ];

  for (const rec of filtered) {
    const type = normalizeType(rec.type);
    const stamp = rec.created_at ? ` · ${rec.created_at}` : '';
    const idx = Number.isSafeInteger(rec.step_index) ? `#${rec.step_index}` : '';

    if (type === 'USER_INPUT') {
      const body = cleanUserText(rec.content || '');
      const media = formatMedia(rec.media);
      lines.push(`## User (${idx}${stamp})`, '');
      if (body) lines.push(body, '');
      if (media) lines.push(media, '');
    } else if (type === 'PLANNER_RESPONSE') {
      lines.push(`## Assistant (${idx}${stamp})`, '');
      if (includeThinking && typeof rec.thinking === 'string' && rec.thinking.trim()) {
        lines.push(`<details>\n<summary>Thinking</summary>\n\n${rec.thinking.trim()}\n\n</details>`, '');
      }
      if (typeof rec.content === 'string' && rec.content.trim()) {
        lines.push(rec.content.trim(), '');
      }
      if (includeTools && Array.isArray(rec.tool_calls) && rec.tool_calls.length) {
        lines.push(formatToolCalls(rec.tool_calls), '');
      }
      const media = formatMedia(rec.media);
      if (media) lines.push(media, '');
    } else if (type === 'GENERIC' || type === 'TOOL_RESULT' || type === 'TOOL_OUTPUT') {
      const text = typeof rec.content === 'string' ? rec.content.trim() : '';
      if (text) {
        lines.push(`<details>\n<summary>Tool Output (${escapeSummary(idx + stamp)})</summary>\n\n${fenceBlock(text)}\n\n</details>`, '');
      }
    } else {
      const label = type || rec.source || 'SYSTEM';
      const body = typeof rec.content === 'string' && rec.content.trim()
        ? rec.content.trim()
        : typeof rec.error === 'string' && rec.error.trim()
          ? rec.error.trim()
          : '';
      if (body) {
        lines.push(`<details>\n<summary>${escapeSummary(label)} (${escapeSummary(idx + stamp)})</summary>\n\n${body}\n\n</details>`, '');
      }
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function buildExportFilename(title, id, format, now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  const slug = String(title || '')
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const shortId = String(id || '').slice(0, 8).toLowerCase();
  const ext = format === 'json' ? 'json' : 'md';
  return `${date}_${slug || 'conversation'}_${shortId}.${ext}`;
}

async function atomicWrite(file, content) {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
}

export async function exportConversations({
  ids = [],
  format = 'md',
  includeThinking = false,
  includeTools = false,
  includeSystem = false,
  save = true,
  outputDir = null,
  summaries = [],
  root = transcriptBrainRoot(),
} = {}) {
  const normalizedFormat = format === 'json' ? 'json' : 'md';
  const uniqueIds = [];
  const seen = new Set();
  for (const rawId of Array.isArray(ids) ? ids : []) {
    if (typeof rawId !== 'string' || !GUID.test(rawId)) continue;
    const lower = rawId.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    uniqueIds.push(lower);
    if (uniqueIds.length >= MAX_EXPORT_IDS) break;
  }
  if (!uniqueIds.length) throw new Error('Select at least one conversation to export');

  const summaryMap = new Map();
  for (const item of summaries || []) {
    if (item?.id && GUID.test(item.id)) summaryMap.set(item.id.toLowerCase(), item);
  }

  const targetDir = save ? resolveOutputDir(outputDir) : null;
  if (save) await mkdir(targetDir, { recursive: true });

  const files = [];
  const skipped = [];

  for (const id of uniqueIds) {
    const located = await locateTranscript(id, root);
    if (!located) {
      skipped.push({ id, reason: 'missing' });
      continue;
    }
    const records = await parseTranscript(located.file);
    const title = summaryMap.get(id)?.title || (await fallbackTitleFromFile(located.file)) || id.slice(0, 8);
    const filtered = filterRecords(records, { includeThinking, includeTools, includeSystem });
    const content = normalizedFormat === 'json'
      ? JSON.stringify({
        conversationId: id,
        title,
        exportedAt: new Date().toISOString(),
        sourceKind: located.kind,
        options: { includeThinking, includeTools, includeSystem },
        totalSteps: records.length,
        steps: filtered,
      }, null, 2) + '\n'
      : formatTranscriptMarkdown(records, {
        title,
        conversationId: id,
        includeThinking,
        includeTools,
        includeSystem,
      });

    const filename = buildExportFilename(title, id, normalizedFormat);
    const bytes = Buffer.byteLength(content, 'utf8');
    if (save) {
      const dest = join(targetDir, filename);
      await atomicWrite(dest, content);
      files.push({ id, title, filename, path: dest, bytes, steps: filtered.length, totalSteps: records.length });
    } else {
      files.push({ id, title, filename, content, bytes, steps: filtered.length, totalSteps: records.length });
    }
  }

  if (!files.length) throw new Error('No readable conversation transcripts were found');
  return { ok: true, dir: targetDir, format: normalizedFormat, files, skipped };
}
