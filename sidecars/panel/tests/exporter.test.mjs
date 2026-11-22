import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildExportFilename,
  cleanUserText,
  exportConversations,
  formatTranscriptMarkdown,
  listExportableConversations,
  parseTranscript,
} from '../exporter.mjs';

const ID_A = '11111111-2222-3333-4444-555555555555';
const ID_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

async function writeTranscript(root, id, lines, filename = 'transcript_full.jsonl') {
  const dir = join(root, id, '.system_generated', 'logs');
  await mkdir(dir, { recursive: true });
  const file = join(dir, filename);
  await writeFile(file, lines.map(row => (typeof row === 'string' ? row : JSON.stringify(row))).join('\n') + '\n', 'utf8');
  return file;
}

test('cleanUserText unwraps USER_REQUEST and strips ADDITIONAL_METADATA', () => {
  const wrapped = '<USER_REQUEST>\nExport my chat\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nTime: now\n</ADDITIONAL_METADATA>';
  assert.equal(cleanUserText(wrapped), 'Export my chat');
  assert.equal(cleanUserText('Plain message\n<ADDITIONAL_METADATA>meta</ADDITIONAL_METADATA>'), 'Plain message');
});

test('parseTranscript deduplicates step_index keeping the last revision and ignores corrupt lines', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ag-exp-parse-'));
  try {
    const file = await writeTranscript(root, ID_A, [
      { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', created_at: '2026-11-19T10:00:00Z', content: 'old' },
      '{broken json',
      { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', created_at: '2026-11-19T10:00:01Z', content: 'new' },
      { step_index: 2, source: 'MODEL', type: 'PLANNER_RESPONSE', created_at: '2026-11-19T10:00:05Z', content: 'reply' },
    ]);
    const records = await parseTranscript(file);
    assert.equal(records.length, 2);
    assert.equal(records[0].content, 'new');
    assert.equal(records[1].content, 'reply');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('formatTranscriptMarkdown selectively includes thinking, tools, and system steps', () => {
  const records = [
    { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', created_at: '2026-11-19T10:00:00Z', content: '<USER_REQUEST>\nHello\n</USER_REQUEST>' },
    { step_index: 1, source: 'SYSTEM_SDK', type: 'EPHEMERAL_MESSAGE', created_at: '2026-11-19T10:00:00Z', content: 'Internal rule reminder' },
    { step_index: 2, source: 'MODEL', type: 'PLANNER_RESPONSE', created_at: '2026-11-19T10:00:01Z', thinking: 'Secret reasoning', tool_calls: [{ name: 'read_file', args: { Path: '/tmp/a' } }] },
    { step_index: 3, source: 'MODEL', type: 'GENERIC', created_at: '2026-11-19T10:00:02Z', content: 'file body' },
    { step_index: 4, source: 'MODEL', type: 'PLANNER_RESPONSE', created_at: '2026-11-19T10:00:03Z', thinking: 'Final thought', content: 'Done!' },
  ];

  const minimal = formatTranscriptMarkdown(records, { title: 'Test Chat', conversationId: ID_A });
  assert.match(minimal, /# Test Chat/);
  assert.match(minimal, /Hello/);
  assert.match(minimal, /Done!/);
  assert.doesNotMatch(minimal, /Secret reasoning/);
  assert.doesNotMatch(minimal, /read_file/);
  assert.doesNotMatch(minimal, /file body/);
  assert.doesNotMatch(minimal, /Internal rule reminder/);

  const full = formatTranscriptMarkdown(records, {
    title: 'Test Chat',
    conversationId: ID_A,
    includeThinking: true,
    includeTools: true,
    includeSystem: true,
  });
  assert.match(full, /Secret reasoning/);
  assert.match(full, /read_file/);
  assert.match(full, /file body/);
  assert.match(full, /Internal rule reminder/);
});

test('listExportableConversations pins current conversation and falls back to first user prompt for title', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ag-exp-list-'));
  try {
    await writeTranscript(root, ID_A, [
      { step_index: 0, type: 'USER_INPUT', content: '<USER_REQUEST>\nPrompt derived title\n</USER_REQUEST>' },
    ]);
    await writeTranscript(root, ID_B, [
      { step_index: 0, type: 'USER_INPUT', content: 'Other chat' },
    ], 'transcript.jsonl');

    const items = await listExportableConversations({
      root,
      currentId: ID_B,
      summaries: [{ id: ID_B, title: 'Summary Title', modifiedAt: '2026-11-19T08:00:00Z', stepCount: 4 }],
    });
    assert.equal(items.length, 2);
    assert.equal(items[0].id, ID_B);
    assert.equal(items[0].current, true);
    assert.equal(items[0].title, 'Summary Title');
    assert.equal(items[0].kind, 'compact');
    assert.equal(items[1].id, ID_A);
    assert.equal(items[1].title, 'Prompt derived title');
    assert.equal(items[1].kind, 'full');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('exportConversations writes selective MD/JSON files to outputDir and supports copy mode (save: false)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ag-exp-run-'));
  const outDir = join(root, 'exports');
  try {
    await writeTranscript(root, ID_A, [
      { step_index: 0, type: 'USER_INPUT', content: 'Question 1' },
      { step_index: 1, type: 'PLANNER_RESPONSE', thinking: 'Thought', content: 'Answer 1' },
    ]);

    const saved = await exportConversations({
      ids: [ID_A, '../escape', 'not-a-guid'],
      format: 'md',
      includeThinking: false,
      save: true,
      outputDir: outDir,
      summaries: [{ id: ID_A, title: 'My Export / Test' }],
      root,
    });
    assert.equal(saved.ok, true);
    assert.equal(saved.files.length, 1);
    const written = await readFile(saved.files[0].path, 'utf8');
    assert.match(written, /Question 1/);
    assert.match(written, /Answer 1/);
    assert.doesNotMatch(written, /Thought/);

    const copied = await exportConversations({
      ids: [ID_A],
      format: 'json',
      includeThinking: true,
      save: false,
      root,
    });
    const parsed = JSON.parse(copied.files[0].content);
    assert.equal(parsed.conversationId, ID_A);
    assert.equal(parsed.steps[1].thinking, 'Thought');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildExportFilename sanitizes unsafe path characters', () => {
  const name = buildExportFilename('a/b:c*d? <test>', ID_A, 'md', new Date('2026-11-19T00:00:00Z'));
  assert.equal(name, '2026-11-19_a-b-c-d-test_11111111.md');
});
