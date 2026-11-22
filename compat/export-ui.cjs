// Self-contained chat-header export icon and selective export popover for Antigravity Desktop.
module.exports = function createTopRightExporter({
  language,
  theme,
  getConversationId,
  getComposerBox,
  localGet,
  localSet,
}) {
  const HOST_ID = 'ag-pulse-top-export';
  const existing = document.getElementById(HOST_ID);
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:28px;height:28px;margin:0;position:relative;pointer-events:auto;-webkit-app-region:no-drag;app-region:no-drag;';
  const shadow = host.attachShadow({ mode: 'open' });
  const themeController = theme.attach(host, { embedded: true });

  const t = (key, args) => language.t(key, args);
  const formatBytes = n => typeof n !== 'number' || !Number.isFinite(n)
    ? '—'
    : n >= 1048576
      ? `${(n / 1048576).toFixed(1)} MB`
      : n >= 1024
        ? `${Math.max(1, Math.round(n / 1024))} KB`
        : `${n} B`;

  const style = document.createElement('style');
  style.textContent = `${theme.shadowCss()}
    :host{color-scheme:var(--pulse-scheme);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:var(--pulse-foreground);font-size:11px;-webkit-app-region:no-drag;app-region:no-drag}
    *{box-sizing:border-box}[hidden]{display:none!important}
    button,select,input{font:inherit}button{cursor:pointer}
    button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--pulse-accent);outline-offset:1px}
    .trigger{width:28px;height:28px;display:grid;place-items:center;padding:0;border:0;border-radius:9999px;background:transparent;color:var(--pulse-muted);-webkit-app-region:no-drag;app-region:no-drag;transition:background-color 120ms ease,color 120ms ease,transform 120ms ease}
    .trigger:hover,.trigger[aria-expanded="true"]{background:var(--pulse-hover);color:var(--pulse-hover-text)}
    .trigger[aria-expanded="true"]{color:var(--pulse-accent)}
    .trigger:active{transform:scale(.96)}
    .trigger svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.45;stroke-linecap:round;stroke-linejoin:round;display:block}
    .panel{position:fixed;inset:auto;margin:0;top:78px;left:12px;width:336px;max-width:calc(100vw - 24px);max-height:min(490px,calc(100vh - 96px));display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:12px;background:linear-gradient(155deg,var(--pulse-card),var(--pulse-card-end));border:1px solid var(--pulse-border);box-shadow:0 12px 36px var(--pulse-shadow);color:var(--pulse-foreground);z-index:2147483000;-webkit-app-region:no-drag;app-region:no-drag}
    .panel::backdrop{background:transparent;pointer-events:none}
    .head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:8px;border-bottom:1px solid var(--pulse-separator)}
    .head-title{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600}
    .head-title svg{width:13px;height:13px;fill:none;stroke:var(--pulse-accent);stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}
    .head-actions{display:flex;align-items:center;gap:4px}
    .mini{height:20px;padding:0 6px;border:1px solid var(--pulse-separator);border-radius:9999px;background:var(--pulse-control);color:var(--pulse-label);font-size:10px}
    .mini:hover{background:var(--pulse-hover);color:var(--pulse-hover-text)}
    .opts{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
    .pill{display:inline-flex;align-items:center;gap:5px;padding:3px 8px 3px 5px;border:1px solid var(--pulse-separator);border-radius:9999px;background:var(--pulse-control);color:var(--pulse-label);font-size:10px;cursor:pointer;user-select:none;transition:border-color 120ms ease,background-color 120ms ease}
    .pill:hover{background:var(--pulse-hover)}
    .pill:has(input:checked){border-color:color-mix(in srgb,var(--pulse-accent) 45%,var(--pulse-separator));color:var(--pulse-foreground)}
    input[type="checkbox"]{appearance:none;-webkit-appearance:none;position:relative;flex:none;width:14px;height:14px;margin:0;border-radius:50%;border:1.5px solid var(--pulse-border);background:var(--pulse-background);cursor:pointer;transition:background-color 140ms ease,border-color 140ms ease,transform 120ms ease}
    input[type="checkbox"]:hover{border-color:var(--pulse-accent)}
    input[type="checkbox"]:checked{background:var(--pulse-accent);border-color:var(--pulse-accent)}
    input[type="checkbox"]:checked::after{content:'';position:absolute;left:4px;top:1.5px;width:3.5px;height:6.5px;border:solid #fff;border-width:0 1.6px 1.6px 0;transform:rotate(45deg)}
    input[type="checkbox"]:active{transform:scale(.92)}
    .fmt{width:62px;height:22px;margin-left:auto;border:1px solid var(--pulse-separator);border-radius:9999px;padding:0 7px;background:var(--pulse-control);color:var(--pulse-control-text);font-size:10px}
    .list{flex:1;min-height:80px;max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;padding-right:2px;scrollbar-width:thin;scrollbar-color:var(--pulse-border) transparent}
    .item{display:flex;align-items:center;gap:7px;padding:6px 8px;border:1px solid var(--pulse-separator);border-radius:9px;background:var(--pulse-background);cursor:pointer;font-size:10px;transition:background-color 120ms ease,border-color 120ms ease}
    .item:hover{background:var(--pulse-hover)}
    .item:has(input:checked){border-color:color-mix(in srgb,var(--pulse-accent) 38%,var(--pulse-separator))}
    .item-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--pulse-foreground)}
    .badge{flex:none;padding:1px 5px;border-radius:9999px;background:color-mix(in srgb,var(--pulse-accent) 14%,transparent);color:var(--pulse-accent);font-size:9px;font-weight:600}
    .meta{flex:none;color:var(--pulse-muted);font-size:9px;font-variant-numeric:tabular-nums}
    .empty{margin:14px 0;color:var(--pulse-muted);font-size:10px;text-align:center}
    .foot{display:flex;flex-direction:column;gap:7px;padding-top:8px;border-top:1px solid var(--pulse-separator)}
    .dir-row{display:flex;align-items:center;gap:6px;font-size:10px;color:var(--pulse-muted)}
    .dir-row span{flex:none}
    .dir-input{flex:1;min-width:0;height:25px;padding:0 8px;border:1px solid var(--pulse-separator);border-radius:7px;background:var(--pulse-control);color:var(--pulse-control-text);font-size:10px}
    .actions{display:flex;gap:6px}
    .btn-primary,.btn-secondary{height:28px;padding:0 11px;border-radius:8px;font-size:10.5px;font-weight:600;transition:background-color 150ms ease,border-color 150ms ease,transform 100ms ease}
    .btn-primary{flex:1;border:0;background:var(--pulse-accent);color:#fff}
    .btn-primary.done{background:var(--pulse-success,#16a34a)}
    .btn-secondary{border:1px solid var(--pulse-separator);background:var(--pulse-control);color:var(--pulse-control-text)}
    .btn-secondary.done{border-color:var(--pulse-success,#16a34a);color:var(--pulse-success,#16a34a)}
    .btn-secondary:hover:not(:disabled){background:var(--pulse-hover)}
    .btn-primary:active:not(:disabled),.btn-secondary:active:not(:disabled){transform:scale(.98)}
    .btn-primary:disabled,.btn-secondary:disabled{opacity:.45;cursor:not-allowed}
    .status-bar{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:8px;font-size:10px;line-height:1.35;border:1px solid transparent}
    .status-bar.ok{background:color-mix(in srgb,var(--pulse-success,#16a34a) 12%,transparent);border-color:color-mix(in srgb,var(--pulse-success,#16a34a) 35%,transparent);color:var(--pulse-foreground)}
    .status-bar.error{background:color-mix(in srgb,var(--pulse-warning,#d97706) 12%,transparent);border-color:color-mix(in srgb,var(--pulse-warning,#d97706) 35%,transparent);color:var(--pulse-warning,#d97706)}
    .status-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  `;
  shadow.append(style);

  const exportSvg = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M8 10V2.6m0 0L5.2 5.4M8 2.6l2.8 2.8M3 9.5v2.4A1.6 1.6 0 0 0 4.6 13.5h6.8A1.6 1.6 0 0 0 13 11.9V9.5');
    svg.append(path);
    return svg;
  };

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'trigger';
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.append(exportSvg());

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.setAttribute('role', 'dialog');
  try { panel.popover = 'manual'; } catch {}
  panel.hidden = true;

  const head = document.createElement('div');
  head.className = 'head';
  const headTitle = document.createElement('span');
  headTitle.className = 'head-title';
  const headTitleText = document.createElement('span');
  headTitle.append(exportSvg(), headTitleText);

  const headActions = document.createElement('div');
  headActions.className = 'head-actions';
  const btnAll = document.createElement('button');
  btnAll.type = 'button';
  btnAll.className = 'mini';
  const btnNone = document.createElement('button');
  btnNone.type = 'button';
  btnNone.className = 'mini';
  const btnClose = document.createElement('button');
  btnClose.type = 'button';
  btnClose.className = 'mini';
  btnClose.textContent = '×';
  headActions.append(btnAll, btnNone, btnClose);
  head.append(headTitle, headActions);

  const opts = document.createElement('div');
  opts.className = 'opts';
  const makeOption = (storageKey) => {
    const labelEl = document.createElement('label');
    labelEl.className = 'pill';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = localGet(storageKey) === '1';
    box.addEventListener('change', () => localSet(storageKey, box.checked ? '1' : '0'));
    const span = document.createElement('span');
    labelEl.append(box, span);
    return { labelEl, box, span };
  };
  const optThinking = makeOption('ag-pulse-exp-thinking');
  const optTools = makeOption('ag-pulse-exp-tools');
  const optSystem = makeOption('ag-pulse-exp-system');

  const fmtSelect = document.createElement('select');
  fmtSelect.className = 'fmt';
  fmtSelect.setAttribute('aria-label', 'Format');
  const optMd = document.createElement('option');
  optMd.value = 'md';
  optMd.textContent = 'MD';
  const optJson = document.createElement('option');
  optJson.value = 'json';
  optJson.textContent = 'JSON';
  fmtSelect.append(optMd, optJson);
  const savedFmt = localGet('ag-pulse-exp-format');
  if (savedFmt === 'md' || savedFmt === 'json') fmtSelect.value = savedFmt;
  fmtSelect.addEventListener('change', () => localSet('ag-pulse-exp-format', fmtSelect.value));
  opts.append(optThinking.labelEl, optTools.labelEl, optSystem.labelEl, fmtSelect);

  const listEl = document.createElement('div');
  listEl.className = 'list';
  listEl.setAttribute('role', 'group');

  const foot = document.createElement('div');
  foot.className = 'foot';
  const dirRow = document.createElement('label');
  dirRow.className = 'dir-row';
  const dirLabel = document.createElement('span');
  const dirInput = document.createElement('input');
  dirInput.type = 'text';
  dirInput.className = 'dir-input';
  dirInput.spellcheck = false;
  dirInput.autocomplete = 'off';
  dirRow.append(dirLabel, dirInput);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn-primary';
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn-secondary';
  actions.append(saveBtn, copyBtn);

  const statusBar = document.createElement('div');
  statusBar.className = 'status-bar';
  statusBar.setAttribute('role', 'status');
  statusBar.hidden = true;
  const statusText = document.createElement('span');
  statusText.className = 'status-text';
  statusBar.append(statusText);

  foot.append(dirRow, actions, statusBar);
  panel.append(head, opts, listEl, foot);
  shadow.append(trigger, panel);

  let open = false;
  let busy = false;
  let items = [];
  let selected = new Set();
  let defaultDir = '';
  let disposed = false;
  let hostEnabled = true;
  let feedbackTimer = null;
  let feedbackState = null;

  const copyText = async value => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const area = document.createElement('textarea');
    area.value = value;
    area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  };

  const setStatus = (msg, { isError = false, title = '' } = {}) => {
    if (!msg) {
      statusBar.hidden = true;
      statusBar.className = 'status-bar';
      statusText.textContent = '';
      statusText.title = '';
      return;
    }
    statusBar.hidden = false;
    statusBar.className = `status-bar ${isError ? 'error' : 'ok'}`;
    statusText.textContent = msg;
    statusText.title = title || msg;
  };

  function flashFeedback(kind, count = 0) {
    clearTimeout(feedbackTimer);
    feedbackState = { kind, count };
    updateButtons();
    feedbackTimer = setTimeout(() => {
      feedbackState = null;
      if (!disposed) updateButtons();
    }, 2400);
  }

  function updateButtons() {
    const n = selected.size;
    const savedDone = feedbackState?.kind === 'save';
    const copiedDone = feedbackState?.kind === 'copy';
    saveBtn.classList.toggle('done', savedDone);
    saveBtn.textContent = busy
      ? t('exportSaving')
      : savedDone
        ? t('exportDone', { n: feedbackState.count })
        : t('exportSave', { n });
    saveBtn.disabled = busy || n === 0;
    copyBtn.classList.toggle('done', copiedDone);
    copyBtn.textContent = copiedDone ? t('exportCopiedShort') : t('exportCopy');
    copyBtn.disabled = busy || n !== 1;
    copyBtn.title = n === 1 ? t('exportCopy') : t('exportCopySingle');
  }

  function localize() {
    trigger.title = t('exportButton');
    trigger.setAttribute('aria-label', t('exportButton'));
    panel.setAttribute('aria-label', t('exportTitle'));
    headTitleText.textContent = t('exportTitle');
    btnAll.textContent = t('exportSelectAll');
    btnNone.textContent = t('exportSelectNone');
    btnClose.setAttribute('aria-label', t('exportClose'));
    btnClose.title = t('exportClose');
    optThinking.span.textContent = t('exportThinking');
    optTools.span.textContent = t('exportTools');
    optSystem.span.textContent = t('exportSystem');
    dirLabel.textContent = t('exportDirLabel');
    updateButtons();
    if (open) renderList();
  }

  function renderList() {
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = t('exportEmpty');
      listEl.replaceChildren(empty);
      updateButtons();
      return;
    }
    const rows = items.map(item => {
      const row = document.createElement('label');
      row.className = 'item';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = selected.has(item.id);
      box.addEventListener('change', () => {
        if (box.checked) selected.add(item.id);
        else selected.delete(item.id);
        updateButtons();
      });
      row.append(box);
      if (item.current) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = t('exportCurrent');
        row.append(badge);
      }
      const titleSpan = document.createElement('span');
      titleSpan.className = 'item-title';
      titleSpan.textContent = item.title || item.id;
      titleSpan.title = item.title || item.id;
      const metaSpan = document.createElement('span');
      metaSpan.className = 'meta';
      metaSpan.textContent = `${formatBytes(item.size)} · ${language.resetDate(item.modifiedAt)}`;
      row.append(titleSpan, metaSpan);
      return row;
    });
    listEl.replaceChildren(...rows);
    updateButtons();
  }

  function findChatColumnBounds() {
    const box = getComposerBox?.() || document.querySelector('[data-testid="agent-input-box"]');
    if (!box || !box.isConnected) return null;
    const boxRect = box.getBoundingClientRect();
    if (boxRect.width <= 0 || boxRect.height <= 0) return null;
    const minHeight = Math.max(240, (window.innerHeight || 720) * 0.45);
    let el = box.parentElement;
    let best = null;
    while (el && el !== document.body && el !== document.documentElement) {
      const r = el.getBoundingClientRect();
      if (r.height >= minHeight && r.width >= boxRect.width - 4) {
        best = { left: r.left, right: r.right };
        break;
      }
      el = el.parentElement;
    }
    return best || { left: Math.max(0, boxRect.left - 80), right: Math.min(window.innerWidth || 1024, boxRect.right + 80) };
  }

  function findChatHeaderSlot() {
    if (!hostEnabled || !getConversationId?.()) return null;
    const col = findChatColumnBounds();
    if (!col) return null;
    const isWindowControl = el => {
      const label = [el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('data-testid')].filter(Boolean).join(' ');
      return /\b(close|minimi[sz]e|maximi[sz]e|restore)\b|关闭|最小化|最大化/i.test(label);
    };
    const isVisibleElement = el => {
      if (!el || !el.isConnected) return false;
      if (el.closest('[hidden],[inert],[role="menu"],[role="dialog"],[role="listbox"],[data-radix-popper-content-wrapper]')) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const isCompactHorizontalRow = (el, bounds) => {
      if (!el || el === document.body || el === document.documentElement) return false;
      const cs = getComputedStyle(el);
      if (!cs.display || !cs.display.includes('flex') || cs.flexDirection !== 'row') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height >= 16 && r.height <= 64 && r.left >= bounds.left - 16 && r.right <= bounds.right + 24;
    };
    const sharedCompactRow = (aEl, bEl, bounds) => {
      if (!aEl || !bEl) return null;
      if (aEl === bEl) return isCompactHorizontalRow(aEl.parentElement, bounds) ? aEl.parentElement : null;
      let ancestor = aEl.parentElement;
      let depth = 0;
      while (ancestor && ancestor !== document.body && ancestor !== document.documentElement && depth < 6) {
        if (ancestor.contains(bEl)) return isCompactHorizontalRow(ancestor, bounds) ? ancestor : null;
        ancestor = ancestor.parentElement;
        depth++;
      }
      return null;
    };
    const isExternalOverlay = (el, bounds) => {
      let cur = el;
      let depth = 0;
      while (cur && cur !== document.body && cur !== document.documentElement && depth < 6) {
        const cs = getComputedStyle(cur);
        if (cs.position === 'fixed' || cs.position === 'absolute') {
          const parent = cur.parentElement;
          if (!parent || parent === document.body || parent === document.documentElement) return true;
          const pr = parent.getBoundingClientRect();
          if (pr.left < bounds.left - 16 || pr.height > 80) return true;
        }
        cur = cur.parentElement;
        depth++;
      }
      return false;
    };
    const buildSlot = (row, leftEl, colMid) => {
      if (!row || !leftEl) return null;
      let slot = leftEl;
      while (slot.parentElement && slot.parentElement !== row) slot = slot.parentElement;
      if (slot.parentElement !== row) return null;
      const sr = slot.getBoundingClientRect();
      if ((sr.left + sr.right) / 2 < colMid) return null;
      return { row, slot };
    };

    const colMid = (col.left + col.right) / 2;

    // Tier 1: Semantic Antigravity Desktop anchors constrained to active chat column.
    for (const toolbar of document.querySelectorAll('[data-testid="pane-titlebar-toolbar"]')) {
      if (!isVisibleElement(toolbar)) continue;
      const tr = toolbar.getBoundingClientRect();
      if (tr.height < 16 || tr.height > 64 || tr.top < 0 || tr.bottom > 100) continue;
      if (tr.left < col.left - 16 || tr.right > col.right + 24 || tr.right < colMid) continue;

      const moreBtn = toolbar.querySelector('[data-testid="titlebar-more-actions"]');
      if (moreBtn && moreBtn !== host && !host.contains(moreBtn) && isVisibleElement(moreBtn) && isCompactHorizontalRow(moreBtn.parentElement, col)) {
        const match = buildSlot(moreBtn.parentElement, moreBtn, colMid);
        if (match) return match;
      }

      const btns = [];
      for (const el of toolbar.querySelectorAll('button,[role="button"]')) {
        if (el === host || host.contains(el) || isWindowControl(el) || !isVisibleElement(el)) continue;
        btns.push({ el, r: el.getBoundingClientRect() });
      }
      btns.sort((a, b) => a.r.left - b.r.left);
      for (const { el } of btns) {
        if (!isCompactHorizontalRow(el.parentElement, col)) continue;
        const match = buildSlot(el.parentElement, el, colMid);
        if (match) return match;
      }
    }

    for (const el of document.querySelectorAll('[data-testid="titlebar-more-actions"]')) {
      if (el === host || host.contains(el) || !isVisibleElement(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > 100 || r.right > col.right + 24) continue;
      if (!isCompactHorizontalRow(el.parentElement, col)) continue;
      const match = buildSlot(el.parentElement, el, colMid);
      if (match) return match;
    }

    // Tier 2: Hardened geometric fallback when semantic data-testids are absent.
    const candidates = [];
    for (const el of document.querySelectorAll('button,[role="button"]')) {
      if (el === host || host.contains(el)) continue;
      if (el.getAttribute('data-testid') === 'toggle-aux-sidebar') continue;
      if (isWindowControl(el) || !el.querySelector('svg')) continue;
      if (!isVisibleElement(el) || isExternalOverlay(el, col) || !isCompactHorizontalRow(el.parentElement, col)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 16 || r.width > 52 || r.height < 16 || r.height > 48) continue;
      if (r.top < 26 || r.bottom > 84) continue;
      if ((r.left + r.right) / 2 < colMid || r.right > col.right + 24) continue;
      candidates.push({ el, r });
    }
    if (!candidates.length) return null;

    const rows = [];
    for (const item of candidates) {
      const midY = (item.r.top + item.r.bottom) / 2;
      const row = rows.find(group => Math.abs(group.midY - midY) <= 12);
      if (row) {
        row.items.push(item);
        row.midY = row.items.reduce((sum, x) => sum + (x.r.top + x.r.bottom) / 2, 0) / row.items.length;
      } else {
        rows.push({ midY, items: [item] });
      }
    }

    const clusters = [];
    for (const row of rows) {
      const sorted = [...row.items].sort((a, b) => b.r.right - a.r.right);
      const visited = new Set();
      for (let start = 0; start < sorted.length; start++) {
        if (visited.has(start)) continue;
        visited.add(start);
        const seed = sorted[start];
        const cluster = [seed];
        for (let i = start + 1; i < sorted.length; i++) {
          if (visited.has(i)) continue;
          const prev = cluster[cluster.length - 1];
          const next = sorted[i];
          if (prev.r.left - next.r.right > 28) break;
          if (!sharedCompactRow(seed.el, next.el, col) || !sharedCompactRow(prev.el, next.el, col)) continue;
          visited.add(i);
          cluster.push(next);
        }
        const rowEl = sharedCompactRow(cluster[0].el, cluster[cluster.length - 1].el, col);
        if (!rowEl) continue;
        const avgMidY = cluster.reduce((sum, x) => sum + (x.r.top + x.r.bottom) / 2, 0) / cluster.length;
        clusters.push({ cluster, rowEl, avgMidY });
      }
    }
    if (!clusters.length) return null;

    const multi = clusters.filter(c => c.cluster.length >= 2);
    const pool = (multi.length ? multi : clusters).sort((a, b) => a.avgMidY - b.avgMidY || b.cluster.length - a.cluster.length);
    const chosen = pool[0];
    if (!chosen?.cluster?.length) return null;

    return buildSlot(chosen.rowEl, chosen.cluster[chosen.cluster.length - 1].el, colMid);
  }

  function positionPanel() {
    if (!open || !host.isConnected) return;
    const width = window.innerWidth || 1024;
    const rect = trigger.getBoundingClientRect();
    const panelWidth = Math.min(336, width - 24);
    const left = Math.max(12, Math.min(width - panelWidth - 12, Math.round(rect.right - panelWidth)));
    const top = Math.max(12, Math.round(rect.bottom + 8));
    const nextTop = `${top}px`;
    const nextLeft = `${left}px`;
    if (panel.style.top !== nextTop) panel.style.top = nextTop;
    if (panel.style.left !== nextLeft) panel.style.left = nextLeft;
  }

  function positionButton() {
    if (disposed) return;
    const target = findChatHeaderSlot();
    if (!target) {
      if (open) setOpen(false);
      if (host.isConnected) host.remove();
      return;
    }
    const gap = parseFloat(getComputedStyle(target.row).columnGap);
    const nextMarginRight = Number.isFinite(gap) && gap > 0 ? '0px' : '4px';
    if (host.style.marginRight !== nextMarginRight) host.style.marginRight = nextMarginRight;
    if (!host.isConnected || host.parentElement !== target.row || host.nextElementSibling !== target.slot) {
      target.row.insertBefore(host, target.slot);
    }
    if (open) positionPanel();
  }

  async function loadList() {
    const loading = document.createElement('p');
    loading.className = 'empty';
    loading.textContent = t('exportLoading');
    listEl.replaceChildren(loading);
    setStatus('');
    try {
      const currentId = getConversationId?.() || null;
      const data = await window.agPulseHost.listExports({ conversationId: currentId });
      if (disposed) return;
      if (!data || data.error) throw new Error(data?.error || t('exportFailed'));
      defaultDir = data.defaultDir || '';
      if (!dirInput.value) dirInput.value = localGet('ag-pulse-export-dir') || defaultDir;
      items = Array.isArray(data.conversations) ? data.conversations : [];
      const available = new Set(items.map(i => i.id));
      selected = new Set([...selected].filter(id => available.has(id)));
      if (!selected.size && items.length) {
        const first = items.find(i => i.current) || items[0];
        if (first) selected.add(first.id);
      }
      renderList();
    } catch (error) {
      if (disposed) return;
      items = [];
      renderList();
      setStatus(error?.message || t('exportFailed'), { isError: true });
    }
  }

  function setOpen(next) {
    open = Boolean(next);
    trigger.setAttribute('aria-expanded', String(open));
    if (open) {
      panel.hidden = false;
      try { if (typeof panel.showPopover === 'function' && !panel.matches(':popover-open')) panel.showPopover(); } catch {}
      positionPanel();
      void loadList();
    } else {
      try { if (typeof panel.hidePopover === 'function' && panel.matches(':popover-open')) panel.hidePopover(); } catch {}
      panel.hidden = true;
    }
  }

  async function runExport(save) {
    if (busy || !selected.size) return;
    if (!save && selected.size !== 1) {
      setStatus(t('exportCopySingle'), { isError: true });
      return;
    }
    const outputDir = dirInput.value.trim();
    if (outputDir) localSet('ag-pulse-export-dir', outputDir);
    clearTimeout(feedbackTimer);
    feedbackState = null;
    busy = true;
    updateButtons();
    setStatus('');
    try {
      const data = await window.agPulseHost.exportChats({
        ids: [...selected],
        format: fmtSelect.value || 'md',
        includeThinking: Boolean(optThinking.box.checked),
        includeTools: Boolean(optTools.box.checked),
        includeSystem: Boolean(optSystem.box.checked),
        save,
        outputDir: outputDir || null,
      });
      if (disposed) return;
      if (!data || !data.ok) throw new Error(data?.error || t('exportFailed'));
      if (save) {
        const count = data.files?.length || 0;
        if (count === 1) {
          const item = data.files[0];
          setStatus(`✓ ${t('exportSavedOne', { file: item.filename || item.path })}`, { title: item.path });
        } else {
          setStatus(`✓ ${t('exportSaved', { n: count, dir: data.dir || '' })}`, { title: data.dir || '' });
        }
        flashFeedback('save', count);
      } else {
        const item = data.files?.[0];
        if (!item?.content) throw new Error(t('exportFailed'));
        await copyText(item.content);
        setStatus(`✓ ${t('exportCopied', { title: item.title || item.filename })}`);
        flashFeedback('copy', 1);
      }
    } catch (error) {
      if (!disposed) setStatus(error?.message || t('exportFailed'), { isError: true });
    } finally {
      if (!disposed) {
        busy = false;
        updateButtons();
      }
    }
  }

  trigger.addEventListener('pointerdown', event => {
    event.stopPropagation();
  });
  trigger.addEventListener('click', event => {
    event.stopPropagation();
    setOpen(!open);
  });
  btnClose.addEventListener('click', () => setOpen(false));
  btnAll.addEventListener('click', () => {
    selected = new Set(items.map(i => i.id));
    renderList();
  });
  btnNone.addEventListener('click', () => {
    selected.clear();
    renderList();
  });
  saveBtn.addEventListener('click', () => void runExport(true));
  copyBtn.addEventListener('click', () => void runExport(false));

  const onPointerDown = event => {
    if (open && !event.composedPath().includes(host)) setOpen(false);
  };
  const onKeyDown = event => {
    if (open && event.key === 'Escape') setOpen(false);
  };
  const onResize = () => positionButton();

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', onResize);

  localize();
  positionButton();

  return {
    syncTheme(nextTheme) { themeController?.setHostTheme?.(nextTheme); },
    localize,
    reposition: positionButton,
    setVisible(visible) {
      hostEnabled = Boolean(visible);
      if (!hostEnabled) { setOpen(false); if (host.isConnected) host.remove(); }
      else positionButton();
    },
    dispose() {
      disposed = true;
      clearTimeout(feedbackTimer);
      setOpen(false);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onResize);
      themeController?.dispose?.();
      host.remove();
    },
  };
};
