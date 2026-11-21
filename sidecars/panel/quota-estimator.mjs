// Hybrid quota full-capacity estimator:
// 1. Differentiated per-window cold-start thresholds (weekly 2% + >=5 reqs, 5h 3% + >=5 reqs, or >=5% standalone)
// 2. Active-cycle monotonic sampling + mid-cycle reset detection + Theil-Sen median slope
// 3. Cross-cycle Empirical Bayes shrinkage with automatic regime-shift bypass for official quota changes
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const VERSION = 1;
const FILE_NAME = 'quota-calibration-v1.json';
const MAX_ACCOUNTS = 16;
const MAX_WINDOWS = 16;
const MAX_SAMPLES = 40;
const SHIFT_HIGH = 1.45;
const SHIFT_LOW = 0.68;
const RESET_SHIFT_MINUTES = 2;
const MID_CYCLE_BOUNCE_DELTA = 0.005;
const SAMPLE_MIN_STEP = 0.002;

const WINDOW_CFG = {
  weekly: {
    coldMinUsed: 0.02,
    coldMinReqs: 5,
    soloMinUsed: 0.05,
    warmMinUsed: 0.01,
    priorShrinkU0: 0.025,
    slopeMinSpan: 0.02,
    slopeMinPairDu: 0.004,
    shiftMinUsed: 0.03,
    shiftMinReqs: 8,
    priorUpdateMinUsed: 0.08,
    priorUpdateMinReqs: 10,
  },
  '5h': {
    coldMinUsed: 0.03,
    coldMinReqs: 5,
    soloMinUsed: 0.05,
    warmMinUsed: 0.015,
    priorShrinkU0: 0.04,
    slopeMinSpan: 0.03,
    slopeMinPairDu: 0.008,
    shiftMinUsed: 0.05,
    shiftMinReqs: 8,
    priorUpdateMinUsed: 0.10,
    priorUpdateMinReqs: 10,
  },
};

function cfgFor(windowKind) {
  return WINDOW_CFG[windowKind] || WINDOW_CFG['5h'];
}

function finitePos(n) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function thinSamples(samples, limit = MAX_SAMPLES) {
  if (samples.length <= limit) return samples;
  const out = [samples[0]];
  const inner = limit - 2;
  const lastIdx = samples.length - 1;
  for (let i = 1; i <= inner; i++) {
    const idx = Math.round((i * lastIdx) / (inner + 1));
    const item = samples[idx];
    if (item && item !== out[out.length - 1]) out.push(item);
  }
  out.push(samples[lastIdx]);
  return out;
}

export function computeTheilSenSlope(samples, livePoint, cfg) {
  const pts = Array.isArray(samples) ? [...samples] : [];
  if (livePoint && finitePos(livePoint.u) && finitePos(livePoint.t)) {
    const last = pts[pts.length - 1];
    if (!last || livePoint.u > last.u + 1e-6) pts.push(livePoint);
  }
  if (pts.length < 3) return null;
  const spanU = pts[pts.length - 1].u - pts[0].u;
  if (spanU < cfg.slopeMinSpan) return null;
  const slopes = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const du = pts[j].u - pts[i].u;
      const dt = pts[j].t - pts[i].t;
      if (du >= cfg.slopeMinPairDu && dt > 0) slopes.push(dt / du);
    }
  }
  return slopes.length >= 2 ? median(slopes) : null;
}

function sanitizeSample(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const t = Number(raw.t), u = Number(raw.u), r = Number(raw.r || 0);
  if (!Number.isFinite(t) || t < 0 || !Number.isFinite(u) || u <= 0 || u > 1) return null;
  return { t: Math.round(t), u: Number(u.toFixed(5)), r: Number.isFinite(r) && r >= 0 ? Math.round(r) : 0 };
}

function sanitizeShiftConfirm(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const dir = raw.dir === 1 || raw.dir === -1 ? raw.dir : 0;
  const u = Number(raw.u), t = Number(raw.t), r = Number(raw.r);
  if (!dir || !Number.isFinite(u) || u <= 0 || u > 1 || !Number.isFinite(t) || t < 0 || !Number.isFinite(r) || r < 0) return null;
  return { dir, u: Number(u.toFixed(5)), t: Math.round(t), r: Math.round(r) };
}

function sanitizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const samples = Array.isArray(raw.samples) ? raw.samples.map(sanitizeSample).filter(Boolean).slice(-MAX_SAMPLES) : [];
  return {
    priorFullTokens: finitePos(raw.priorFullTokens) ? Math.round(raw.priorFullTokens) : null,
    priorBaseFullTokens: finitePos(raw.priorBaseFullTokens) ? Math.round(raw.priorBaseFullTokens) : null,
    priorCycles: Number.isSafeInteger(raw.priorCycles) && raw.priorCycles >= 0 ? raw.priorCycles : 0,
    resetMinute: Number.isSafeInteger(raw.resetMinute) ? raw.resetMinute : null,
    midCycleReset: raw.midCycleReset === true,
    confirmedShift: raw.confirmedShift === true,
    shiftConfirm: sanitizeShiftConfirm(raw.shiftConfirm),
    anchorTokens: Number.isFinite(raw.anchorTokens) && raw.anchorTokens >= 0 ? Math.round(raw.anchorTokens) : 0,
    anchorUsed: Number.isFinite(raw.anchorUsed) && raw.anchorUsed >= 0 && raw.anchorUsed <= 1 ? Number(raw.anchorUsed.toFixed(5)) : 0,
    anchorReqs: Number.isFinite(raw.anchorReqs) && raw.anchorReqs >= 0 ? Math.round(raw.anchorReqs) : 0,
    samples,
  };
}

function freshEntry(resetMinute = null) {
  return {
    priorFullTokens: null,
    priorBaseFullTokens: null,
    priorCycles: 0,
    resetMinute,
    midCycleReset: false,
    confirmedShift: false,
    shiftConfirm: null,
    anchorTokens: 0,
    anchorUsed: 0,
    anchorReqs: 0,
    samples: [],
  };
}

export class QuotaEstimator {
  constructor(directory = null) {
    this.directory = directory;
    this.accounts = new Map();
    this.loaded = !directory;
    this.loading = null;
    this.dirty = false;
    this.saving = null;
    this.saveTimer = null;
    this.disposed = false;
  }

  filePath() {
    return this.directory ? join(this.directory, FILE_NAME) : null;
  }

  async load() {
    if (this.loaded) return;
    if (this.loading) return this.loading;
    const file = this.filePath();
    if (!file) { this.loaded = true; return; }
    this.loading = (async () => {
      try {
        const text = await readFile(file, 'utf8');
        const parsed = JSON.parse(text);
        if (parsed?.version === VERSION && parsed.accounts && typeof parsed.accounts === 'object') {
          for (const [acct, wins] of Object.entries(parsed.accounts).slice(0, MAX_ACCOUNTS)) {
            if (!acct || !wins || typeof wins !== 'object') continue;
            const map = this.accounts.get(acct) || new Map();
            for (const [winId, raw] of Object.entries(wins).slice(0, MAX_WINDOWS)) {
              if (map.has(winId)) continue;
              const entry = sanitizeEntry(raw);
              if (entry) map.set(winId, entry);
            }
            if (map.size) this.accounts.set(acct, map);
          }
        }
      } catch {
        // Missing or unreadable calibration file falls back cleanly to cold start.
      } finally {
        this.loaded = true;
        this.loading = null;
      }
    })();
    return this.loading;
  }

  ensureEntry(accountKey, specId) {
    let acctMap = this.accounts.get(accountKey);
    if (!acctMap) {
      acctMap = new Map();
      this.accounts.set(accountKey, acctMap);
      while (this.accounts.size > MAX_ACCOUNTS) {
        this.accounts.delete(this.accounts.keys().next().value);
      }
    }
    let entry = acctMap.get(specId);
    if (!entry) {
      entry = freshEntry();
      acctMap.set(specId, entry);
      while (acctMap.size > MAX_WINDOWS) {
        acctMap.delete(acctMap.keys().next().value);
      }
    }
    return entry;
  }

  scheduleSave() {
    if (!this.directory || this.disposed) return;
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, 1500);
    this.saveTimer.unref?.();
  }

  serialize() {
    const accounts = {};
    for (const [acct, winMap] of this.accounts) {
      const wins = {};
      for (const [id, entry] of winMap) wins[id] = entry;
      accounts[acct] = wins;
    }
    return JSON.stringify({ version: VERSION, accounts });
  }

  async flush() {
    if (!this.directory || !this.dirty) return;
    if (this.saving) return this.saving;
    const file = this.filePath();
    this.dirty = false;
    const payload = this.serialize();
    const tmp = join(this.directory, `.${FILE_NAME}.${randomUUID()}.tmp`);
    this.saving = (async () => {
      try {
        await mkdir(this.directory, { recursive: true });
        await writeFile(tmp, payload, 'utf8');
        await rename(tmp, file);
      } catch {
        // Best-effort calibration persistence must never break usage summaries.
      } finally {
        this.saving = null;
        if (this.dirty && !this.disposed) this.scheduleSave();
      }
    })();
    return this.saving;
  }

  dispose() {
    this.disposed = true;
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
  }

  estimate(accountKey, spec, count, { allowUpdate = true } = {}) {
    const usedFraction = typeof spec.remaining === 'number' ? Math.max(0, Math.min(1, 1 - spec.remaining)) : null;
    if (!count || !count.requests || spec.idle || usedFraction === null || usedFraction <= 0 || !finitePos(count.observedTokens)) {
      return {
        observedTokens: count?.observedTokens || 0,
        estimatedFullTokens: null,
        requests: count?.requests || 0,
        usedFraction,
      };
    }

    const cfg = cfgFor(spec.window);
    const entry = accountKey ? this.ensureEntry(accountKey, spec.id) : freshEntry(spec.resetMinute);
    let mutated = false;

    // 1. Detect scheduled/early cycle reset via resetMinute shift.
    if (allowUpdate && entry.resetMinute !== null && Math.abs(entry.resetMinute - spec.resetMinute) > RESET_SHIFT_MINUTES) {
      entry.priorBaseFullTokens = entry.priorFullTokens;
      entry.resetMinute = spec.resetMinute;
      entry.midCycleReset = false;
      entry.confirmedShift = false;
      entry.shiftConfirm = null;
      entry.anchorTokens = 0;
      entry.anchorUsed = 0;
      entry.anchorReqs = 0;
      entry.samples = [];
      mutated = true;
    } else if (allowUpdate && entry.resetMinute === null) {
      entry.resetMinute = spec.resetMinute;
      entry.priorBaseFullTokens = entry.priorFullTokens;
      mutated = true;
    }

    // 2. Detect sudden mid-cycle quota reset/top-up (remaining jumped UP while resetMinute stayed steady).
    const prevSample = entry.samples[entry.samples.length - 1] || null;
    if (allowUpdate && prevSample && usedFraction < prevSample.u - MID_CYCLE_BOUNCE_DELTA) {
      entry.priorBaseFullTokens = entry.priorFullTokens;
      entry.midCycleReset = true;
      entry.confirmedShift = false;
      entry.shiftConfirm = null;
      entry.anchorTokens = Math.round(count.observedTokens);
      entry.anchorUsed = Number(usedFraction.toFixed(5));
      entry.anchorReqs = Math.round(count.requests);
      entry.samples = [{ t: entry.anchorTokens, u: entry.anchorUsed, r: entry.anchorReqs }];
      mutated = true;
    }

    // 3. Record monotonic sample points when usedFraction advances meaningfully.
    if (allowUpdate) {
      const last = entry.samples[entry.samples.length - 1] || null;
      const sample = { t: Math.round(count.observedTokens), u: Number(usedFraction.toFixed(5)), r: Math.round(count.requests) };
      if (!last) {
        entry.samples.push(sample);
        mutated = true;
      } else if (sample.u >= last.u + SAMPLE_MIN_STEP && sample.t > last.t) {
        entry.samples.push(sample);
        if (entry.samples.length > MAX_SAMPLES) entry.samples = thinSamples(entry.samples, MAX_SAMPLES);
        mutated = true;
      }
    }

    // 4. Compute current-cycle observed estimate strictly from post-anchor deltas.
    // Note: incremental slope eliminates initial unrecorded offsets before local
    // tracking started; continuous concurrent consumption on another device still
    // cannot be distinguished locally from higher quota burn.
    const effTokens = entry.midCycleReset ? Math.max(0, count.observedTokens - entry.anchorTokens) : count.observedTokens;
    const effUsed = entry.midCycleReset ? Math.max(0, usedFraction - entry.anchorUsed) : usedFraction;
    const effReqs = entry.midCycleReset ? Math.max(0, count.requests - entry.anchorReqs) : count.requests;
    const ratioEst = effTokens > 0 && effUsed > 0 ? effTokens / effUsed : null;
    const livePoint = { t: count.observedTokens, u: usedFraction, r: count.requests };
    const slopeEst = computeTheilSenSlope(entry.samples, livePoint, cfg);

    let obsEst = null;
    if (entry.midCycleReset) {
      obsEst = slopeEst ?? ratioEst;
    } else if (slopeEst !== null && ratioEst !== null) {
      // If whole-cycle ratio diverges markedly from local incremental slope
      // (e.g. initial offset from another device before local usage began), trust slope.
      const divergence = ratioEst / slopeEst;
      if (divergence < 0.8 || divergence > 1.25) obsEst = slopeEst;
      else obsEst = 0.6 * ratioEst + 0.4 * slopeEst;
    } else {
      obsEst = slopeEst ?? ratioEst;
    }

    // 5. Evaluate cold-start / warm-start readiness and blend with cross-cycle prior.
    // Display-level shift bypass is reversible; fast prior rewrite requires a second
    // non-overlapping increment confirming the same shift direction.
    const prior = finitePos(entry.priorBaseFullTokens) ? entry.priorBaseFullTokens : null;
    const hasPrior = prior !== null;
    const standaloneReady = effUsed >= cfg.soloMinUsed || (effUsed >= cfg.coldMinUsed && effReqs >= cfg.coldMinReqs);
    const warmReady = hasPrior && effUsed >= cfg.warmMinUsed && effTokens > 0;

    let estimatedFullTokens = null;
    if (obsEst !== null && (standaloneReady || warmReady)) {
      if (!hasPrior) {
        estimatedFullTokens = Math.round(obsEst);
      } else {
        const canDetectShift = effUsed >= cfg.shiftMinUsed && effReqs >= cfg.shiftMinReqs;
        const ratioToPrior = obsEst / prior;
        const shiftDir = ratioToPrior > SHIFT_HIGH ? 1 : (ratioToPrior < SHIFT_LOW ? -1 : 0);
        if (canDetectShift && shiftDir !== 0) {
          if (allowUpdate && !entry.confirmedShift) {
            const sc = entry.shiftConfirm;
            if (!sc || sc.dir !== shiftDir) {
              entry.shiftConfirm = { dir: shiftDir, u: Number(effUsed.toFixed(5)), t: Math.round(effTokens), r: Math.round(effReqs) };
              mutated = true;
            } else {
              const du = effUsed - sc.u;
              const dt = effTokens - sc.t;
              const dr = effReqs - sc.r;
              if (du >= cfg.slopeMinSpan && dt > 0 && dr >= 4) {
                const segRatio = (dt / du) / prior;
                const segConfirmed = shiftDir === 1 ? segRatio > SHIFT_HIGH : segRatio < SHIFT_LOW;
                if (segConfirmed) {
                  entry.confirmedShift = true;
                  mutated = true;
                }
              }
            }
          }
          // Immediately follow the observed regime on display without waiting for slow shrinkage.
          estimatedFullTokens = Math.round(obsEst);
        } else {
          // Reading returned within normal prior range -> clear unconfirmed shift marker.
          if (allowUpdate && !entry.confirmedShift && entry.shiftConfirm) {
            entry.shiftConfirm = null;
            mutated = true;
          }
          const w = effUsed / (effUsed + cfg.priorShrinkU0);
          estimatedFullTokens = Math.round(w * obsEst + (1 - w) * prior);
        }
      }
    }

    // 6. Safely update cross-cycle prior only when post-anchor cycle proves high confidence.
    // Fast learning rate (alpha = 0.65) applies only after non-overlapping shift confirmation.
    if (allowUpdate && obsEst !== null && effUsed >= cfg.priorUpdateMinUsed && effReqs >= cfg.priorUpdateMinReqs) {
      const basePrior = entry.priorBaseFullTokens;
      let nextPrior;
      if (!finitePos(basePrior)) {
        nextPrior = Math.round(obsEst);
      } else {
        const alpha = entry.confirmedShift ? 0.65 : 0.30;
        nextPrior = Math.round(alpha * obsEst + (1 - alpha) * basePrior);
      }
      if (nextPrior !== entry.priorFullTokens) {
        entry.priorFullTokens = nextPrior;
        if (entry.priorCycles === 0 || entry.priorBaseFullTokens !== null) {
          entry.priorCycles = Math.max(1, entry.priorCycles);
        }
        mutated = true;
      }
    }

    if (mutated && accountKey) this.scheduleSave();

    return {
      observedTokens: count.observedTokens,
      estimatedFullTokens,
      requests: count.requests,
      usedFraction,
    };
  }
}
