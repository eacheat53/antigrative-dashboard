import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const createI18n = require('../../../compat/i18n.cjs');

test('inline context card uses mini context breakdown without duplicated quota blocks', () => {
  const source = readFileSync(new URL('../../../compat/inline-widget.cjs', import.meta.url), 'utf8');
  const start = source.indexOf('<section class="card context-card"');
  const end = source.indexOf('</section>`);', start);
  assert.ok(start > 0 && end > start, 'context-card markup should exist');
  const cardMarkup = source.slice(start, end + '</section>'.length);

  for (const id of [
    'context-limit-badge',
    'context-limit-custom-btn',
    'context-compaction-pill',
    'context-non-native-alert',
    'context-limit-editor',
    'context-segmented-track',
    'seg-user',
    'seg-agent',
    'seg-tool',
    'seg-system',
    'bd-user',
    'bd-agent',
    'bd-tool',
    'bd-system',
    'bd-free',
    'bd-compactions',
    'context-note',
  ]) {
    assert.ok(cardMarkup.includes(`id="${id}"`), `Missing #${id} in context-card`);
  }
  assert.equal(cardMarkup.includes('<input'), false, 'input must be created via DOM to satisfy IDE setMarkup allowlist');
  for (const removed of ['quota-siblings', 'five-quota-section', 'week-quota-section', 'active-quota-group']) {
    assert.equal(cardMarkup.includes(removed), false, `Duplicated quota element ${removed} should be removed`);
  }
});

test('all three locales define context breakdown and limit override strings', () => {
  const keys = [
    'contextUsageTitle', 'usageBreakdown', 'freeSpace',
    'contextLimitAuto', 'contextCustomLimit', 'contextCustomPlaceholder',
    'contextCustomApply', 'contextCustomInvalid',
    'contextNonNativeAlert', 'contextPreviewAlert',
    'contextLimitTooltipNative', 'contextLimitTooltipAutoNonNative', 'contextLimitTooltipOverride',
    'contextCompactions', 'contextCompactionCount', 'contextCompactionsTitle',
  ];
  for (const lang of ['en', 'zh-CN', 'zh-TW']) {
    const i18n = createI18n(lang);
    for (const key of keys) {
      const val = i18n.t(key, { n: 2, limit: '512K', native: '256K', host: '256K' });
      assert.notEqual(val, key, `${lang} missing translation for ${key}`);
    }
    assert.ok(i18n.t('contextTokens', { used: '10K', max: '256K' }).endsWith('toks'));
  }
});
