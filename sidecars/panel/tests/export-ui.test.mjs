import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const createI18n = require('../../../compat/i18n.cjs');
const createTheme = require('../../../compat/theme.cjs');
const createTopRightExporter = require('../../../compat/export-ui.cjs');

function makeRect(left, top, right, bottom) {
  return {
    left,
    top,
    right,
    bottom,
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function makeStyle(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get cssText() { return map.get('cssText') || ''; },
    set cssText(value) { map.set('cssText', String(value)); },
    get marginRight() { return map.get('marginRight') || ''; },
    set marginRight(value) { map.set('marginRight', String(value)); },
    get top() { return map.get('top') || ''; },
    set top(value) { map.set('top', String(value)); },
    get left() { return map.get('left') || ''; },
    set left(value) { map.set('left', String(value)); },
    get fontFamily() { return map.get('fontFamily') || ''; },
    getPropertyValue(name) { return map.get(name) || ''; },
    setProperty(name, value) { map.set(name, String(value)); },
    removeProperty(name) { map.delete(name); },
  };
}

function matchesSimple(el, sel) {
  sel = sel.trim();
  if (!sel) return false;
  if (sel === 'button') return el.tagName === 'BUTTON';
  if (sel === 'svg') return el.tagName === 'SVG';
  const attrOnly = sel.match(/^\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]$/);
  if (attrOnly) {
    const actual = el.getAttribute(attrOnly[1]);
    return attrOnly[2] !== undefined ? actual === attrOnly[2] : actual !== null;
  }
  return false;
}

function matchesSelector(el, selector) {
  return selector.split(',').some(part => matchesSimple(el, part));
}

function createFakeDom({ innerWidth = 1292, innerHeight = 875 } = {}) {
  class FakeElement {
    constructor(tagName, { id = '', attrs = {}, rect = [0, 0, 0, 0], style = {}, computed = {} } = {}) {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.attrs = new Map(Object.entries(attrs));
      if (id) this.attrs.set('id', id);
      this.children = [];
      this.parentElement = null;
      this.ownerDocument = null;
      this.dataset = {};
      this.style = makeStyle(style);
      this._rect = makeRect(...rect);
      this._computed = {
        display: 'flex',
        flexDirection: 'row',
        columnGap: 'normal',
        visibility: 'visible',
        opacity: '1',
        position: 'static',
        backgroundColor: '',
        colorScheme: 'light',
        fontFamily: '',
        getPropertyValue: () => '',
        ...computed,
      };
      this._classes = new Set();
      this.classList = {
        contains: name => this._classes.has(name),
        add: (...names) => { for (const name of names) if (name) this._classes.add(name); },
        remove: (...names) => { for (const name of names) this._classes.delete(name); },
        toggle: (name, force) => {
          const next = force === undefined ? !this._classes.has(name) : Boolean(force);
          if (next) this._classes.add(name);
          else this._classes.delete(name);
          return next;
        },
      };
      this.hidden = false;
      this.shadowRoot = null;
      this.listeners = new Map();
    }
    get isConnected() {
      let cur = this;
      while (cur) {
        if (cur === doc.documentElement) return true;
        cur = cur.parentElement;
      }
      return false;
    }
    get nextElementSibling() {
      if (!this.parentElement) return null;
      const idx = this.parentElement.children.indexOf(this);
      return idx >= 0 ? (this.parentElement.children[idx + 1] || null) : null;
    }
    setAttribute(name, value) {
      if (name === 'id') this.id = String(value);
      this.attrs.set(name, String(value));
    }
    getAttribute(name) {
      if (name === 'id' && this.id) return this.id;
      return this.attrs.has(name) ? this.attrs.get(name) : null;
    }
    removeAttribute(name) {
      if (name === 'id') this.id = '';
      this.attrs.delete(name);
    }
    append(...nodes) {
      for (const node of nodes) {
        if (!node || typeof node === 'string') continue;
        if (node.parentElement) node.remove();
        node.parentElement = this;
        node.ownerDocument = this.ownerDocument;
        this.children.push(node);
      }
    }
    insertBefore(node, ref) {
      if (!ref) {
        this.append(node);
        return node;
      }
      if (node.parentElement) node.remove();
      const idx = this.children.indexOf(ref);
      if (idx < 0) throw new Error('Reference node is not a child');
      node.parentElement = this;
      node.ownerDocument = this.ownerDocument;
      this.children.splice(idx, 0, node);
      return node;
    }
    remove() {
      if (!this.parentElement) return;
      const idx = this.parentElement.children.indexOf(this);
      if (idx >= 0) this.parentElement.children.splice(idx, 1);
      this.parentElement = null;
    }
    contains(other) {
      let cur = other;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentElement;
      }
      return false;
    }
    closest(selector) {
      let cur = this;
      while (cur) {
        if (matchesSelector(cur, selector)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
    querySelectorAll(selector) {
      const out = [];
      const walk = node => {
        for (const child of node.children) {
          if (matchesSelector(child, selector)) out.push(child);
          walk(child);
        }
      };
      walk(this);
      return out;
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
    getBoundingClientRect() {
      return this._rect;
    }
    attachShadow() {
      this.shadowRoot = new FakeElement('shadow-root');
      return this.shadowRoot;
    }
    replaceChildren(...nodes) {
      for (const child of [...this.children]) child.parentElement = null;
      this.children = [];
      this.append(...nodes);
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }
    removeEventListener(type, fn) {
      const list = this.listeners.get(type);
      if (!list) return;
      const idx = list.indexOf(fn);
      if (idx >= 0) list.splice(idx, 1);
    }
    getContext() { return null; }
  }

  const doc = {
    documentElement: null,
    head: null,
    body: null,
    createElement(tag) {
      const el = new FakeElement(tag);
      el.ownerDocument = doc;
      return el;
    },
    createElementNS(_ns, tag) {
      const el = new FakeElement(tag);
      el.ownerDocument = doc;
      return el;
    },
    getElementById(id) {
      const walk = node => {
        for (const child of node.children) {
          if (child.id === id) return child;
          const hit = walk(child);
          if (hit) return hit;
        }
        return null;
      };
      return walk(doc.documentElement);
    },
    querySelectorAll(selector) {
      return doc.documentElement.querySelectorAll(selector);
    },
    querySelector(selector) {
      return doc.documentElement.querySelector(selector);
    },
    addEventListener() {},
    removeEventListener() {},
  };

  doc.documentElement = new FakeElement('html', { rect: [0, 0, innerWidth, innerHeight] });
  doc.documentElement.ownerDocument = doc;
  doc.head = new FakeElement('head');
  doc.body = new FakeElement('body', { rect: [0, 0, innerWidth, innerHeight], computed: { display: 'block', flexDirection: 'row' } });
  doc.documentElement.append(doc.head, doc.body);

  const win = {
    innerWidth,
    innerHeight,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
  };

  return {
    doc,
    win,
    el: (tag, opts) => {
      const node = new FakeElement(tag, opts);
      node.ownerDocument = doc;
      return node;
    },
  };
}

function withFakeGlobals({ doc, win }, fn) {
  const prev = {
    document: globalThis.document,
    window: globalThis.window,
    getComputedStyle: globalThis.getComputedStyle,
    MutationObserver: globalThis.MutationObserver,
    CSS: globalThis.CSS,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  };
  const activeIntervals = new Set();
  globalThis.setInterval = (...args) => {
    const id = prev.setInterval(...args);
    activeIntervals.add(id);
    return id;
  };
  globalThis.clearInterval = id => {
    activeIntervals.delete(id);
    return prev.clearInterval(id);
  };
  globalThis.document = doc;
  globalThis.window = win;
  globalThis.getComputedStyle = el => el?._computed || {
    display: 'block',
    flexDirection: 'row',
    columnGap: 'normal',
    visibility: 'visible',
    opacity: '1',
    position: 'static',
    backgroundColor: '',
    colorScheme: 'light',
    fontFamily: '',
    getPropertyValue: () => '',
  };
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.CSS = { supports: () => false };
  try {
    return fn();
  } finally {
    for (const id of activeIntervals) prev.clearInterval(id);
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

function buildDesktopTopology(dom, { includeTestIds = true, splitRightPane = false } = {}) {
  const { el, doc } = dom;
  const tid = name => (includeTestIds ? { 'data-testid': name } : {});
  const iconBtn = (attrs, rect) => {
    const btn = el('button', {
      attrs,
      rect,
      computed: { display: 'flex', flexDirection: 'row', position: 'static', visibility: 'visible', opacity: '1' },
    });
    btn.append(el('svg', { rect: [rect[0] + 6, rect[1] + 6, rect[2] - 6, rect[3] - 6] }));
    return btn;
  };

  const rootFlexRow = el('div', {
    rect: [0, 35, 1292, 875],
    computed: { display: 'flex', flexDirection: 'row', position: 'relative' },
  });

  // Top-left absolute Antigravity logo / new conversation overlay
  const topLeftAbs = el('div', { rect: [0, 35, 174, 75], computed: { display: 'flex', flexDirection: 'row', position: 'absolute' } });
  const topLeftInner = el('div', { rect: [0, 41, 174, 69], computed: { display: 'flex', flexDirection: 'row', position: 'static' } });
  const newConvBtn = iconBtn({ ...tid('app-icon-new-conversation-button'), 'aria-label': 'New Conversation' }, [8, 43, 46, 67]);
  topLeftInner.append(newConvBtn);
  topLeftAbs.append(topLeftInner);

  // Left conversation sidebar
  const sidebarCol = el('div', { rect: [0, 35, 287, 875], computed: { display: 'flex', flexDirection: 'column', position: 'static' } });

  // Main chat pane
  const mainRight = splitRightPane ? 760 : 1292;
  const mainPane = el('div', { rect: [287, 35, mainRight, 875], computed: { display: 'flex', flexDirection: 'column', position: 'static' } });
  const headerBar = el('div', { rect: [287, 35, mainRight, 75], computed: { display: 'flex', flexDirection: 'row', position: 'static' } });
  const toolbar = el('div', {
    attrs: tid('pane-titlebar-toolbar'),
    rect: [mainRight - 100, 41, mainRight, 69],
    computed: { display: 'flex', flexDirection: 'row', position: 'static' },
  });
  const moreLeft = splitRightPane ? 680 : 1192;
  const moreParent = el('div', {
    rect: [moreLeft, 41, moreLeft + 60, 69],
    computed: { display: 'flex', flexDirection: 'row', columnGap: '4px', position: 'static' },
  });
  const moreBtn = iconBtn({ ...tid('titlebar-more-actions'), 'aria-label': 'More actions' }, [moreLeft, 41, moreLeft + 28, 69]);
  const overviewBtn = iconBtn({ ...tid('toggle-overview-panel'), 'aria-label': 'Toggle Overview Panel' }, [moreLeft + 32, 41, moreLeft + 60, 69]);
  moreParent.append(moreBtn, overviewBtn);
  toolbar.append(moreParent);
  headerBar.append(toolbar);

  const convView = el('div', {
    attrs: tid('conversation-view'),
    rect: [287, 75, mainRight - 8, 867],
    computed: { display: 'flex', flexDirection: 'column', position: 'relative' },
  });
  const inputBox = el('div', {
    attrs: tid('agent-input-box'),
    rect: [305, 769, mainRight - 27, 851],
    computed: { display: 'flex', flexDirection: 'column', position: 'static' },
  });
  convView.append(inputBox);
  mainPane.append(headerBar, convView);

  const children = [topLeftAbs, sidebarCol, mainPane];
  let auxMoreParent = null;

  if (splitRightPane) {
    const auxPane = el('div', { rect: [760, 35, 1292, 875], computed: { display: 'flex', flexDirection: 'column', position: 'static' } });
    const auxHeader = el('div', { rect: [760, 35, 1292, 75], computed: { display: 'flex', flexDirection: 'row', position: 'static' } });
    const auxToolbar = el('div', {
      attrs: tid('pane-titlebar-toolbar'),
      rect: [1192, 41, 1292, 69],
      computed: { display: 'flex', flexDirection: 'row', position: 'static' },
    });
    auxMoreParent = el('div', {
      rect: [1192, 41, 1252, 69],
      computed: { display: 'flex', flexDirection: 'row', columnGap: '4px', position: 'static' },
    });
    const auxMoreBtn = iconBtn({ ...tid('titlebar-more-actions'), 'aria-label': 'More actions' }, [1192, 41, 1220, 69]);
    const auxCloseBtn = iconBtn({ 'aria-label': 'Toggle Overview Panel' }, [1224, 41, 1252, 69]);
    auxMoreParent.append(auxMoreBtn, auxCloseBtn);
    auxToolbar.append(auxMoreParent);
    auxHeader.append(auxToolbar);
    auxPane.append(auxHeader);
    children.push(auxPane);
  }

  // Top-right absolute aux sidebar toggle overlay (within 4px of overviewBtn when side panel is closed)
  const topRightAbs = el('div', { rect: [1256, 35, 1292, 75], computed: { display: 'flex', flexDirection: 'row', position: 'absolute' } });
  const topRightInner = el('div', { rect: [1256, 41, 1292, 69], computed: { display: 'flex', flexDirection: 'row', position: 'relative' } });
  const auxToggleBtn = iconBtn({ ...tid('toggle-aux-sidebar'), 'aria-label': 'Toggle Side Panel' }, [1256, 41, 1284, 69]);
  topRightInner.append(auxToggleBtn);
  topRightAbs.append(topRightInner);
  children.push(topRightAbs);

  rootFlexRow.append(...children);
  doc.body.append(rootFlexRow);

  return { rootFlexRow, moreParent, moreBtn, overviewBtn, auxMoreParent, auxToggleBtn, inputBox };
}

test('export button mounts directly left of titlebar-more-actions when right side panel is closed', () => {
  const dom = createFakeDom();
  const { rootFlexRow, moreParent, moreBtn } = buildDesktopTopology(dom, { includeTestIds: true });

  withFakeGlobals(dom, () => {
    const exporter = createTopRightExporter({
      language: createI18n('en'),
      theme: createTheme(),
      getConversationId: () => '11111111-2222-3333-4444-555555555555',
      localGet: () => null,
      localSet: () => {},
    });
    try {
      const host = dom.doc.getElementById('ag-pulse-top-export');
      assert.ok(host, 'export host should be mounted');
      assert.equal(host.parentElement, moreParent);
      assert.equal(host.nextElementSibling, moreBtn);
      assert.equal(host.style.marginRight, '0px');
      assert.notEqual(host.parentElement, rootFlexRow);
    } finally {
      exporter.dispose();
    }
  });
});

test('export button geometric fallback still mounts inside chat titlebar when data-testids are absent', () => {
  const dom = createFakeDom();
  const { rootFlexRow, moreParent, moreBtn, inputBox } = buildDesktopTopology(dom, { includeTestIds: false });

  withFakeGlobals(dom, () => {
    const exporter = createTopRightExporter({
      language: createI18n('en'),
      theme: createTheme(),
      getConversationId: () => '11111111-2222-3333-4444-555555555555',
      getComposerBox: () => inputBox,
      localGet: () => null,
      localSet: () => {},
    });
    try {
      const host = dom.doc.getElementById('ag-pulse-top-export');
      assert.ok(host, 'export host should be mounted in geometric fallback');
      assert.equal(host.parentElement, moreParent);
      assert.equal(host.nextElementSibling, moreBtn);
      assert.notEqual(host.parentElement, rootFlexRow);
    } finally {
      exporter.dispose();
    }
  });
});

test('export button mounts in main chat column rather than open right aux pane toolbar', () => {
  const dom = createFakeDom();
  const { moreParent, moreBtn, auxMoreParent, inputBox } = buildDesktopTopology(dom, { includeTestIds: true, splitRightPane: true });

  withFakeGlobals(dom, () => {
    const exporter = createTopRightExporter({
      language: createI18n('en'),
      theme: createTheme(),
      getConversationId: () => '11111111-2222-3333-4444-555555555555',
      getComposerBox: () => inputBox,
      localGet: () => null,
      localSet: () => {},
    });
    try {
      const host = dom.doc.getElementById('ag-pulse-top-export');
      assert.ok(host, 'export host should be mounted');
      assert.equal(host.parentElement, moreParent);
      assert.equal(host.nextElementSibling, moreBtn);
      assert.notEqual(host.parentElement, auxMoreParent);
    } finally {
      exporter.dispose();
    }
  });
});
