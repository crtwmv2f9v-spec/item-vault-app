// Offline-first storage: IndexedDB cache + Mutation Outbox + GitHub Git Data API atomic sync.

import { applyOp, nowISO, todayISO } from './model.js';

const te = new TextEncoder();
const td = new TextDecoder();

export class NetworkError extends Error {}
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function formatApiError(err, phase = 'sync') {
  if (!(err instanceof ApiError)) return err?.message || String(err);
  if (err.status === 401) {
    return 'Token 无效或已过期（HTTP 401），请在设置中检查或重新生成。';
  }
  if (err.status === 403) {
    if (phase === 'write') {
      return 'Token 无写入权限（HTTP 403）：若为 Contents: Read-only，请切为「只读搜索模式」或放弃待同步修改，以便继续拉取电脑端新增物品。';
    }
    return 'GitHub 拒绝访问（HTTP 403）：请检查 Token 是否勾选了该私有仓的 Contents 权限。';
  }
  if (err.status === 404) {
    return '找不到仓库或分支（HTTP 404）：请确认仓库名正确，且 Token 已授权该私有仓（Only select repositories）。';
  }
  return `GitHub API 错误（HTTP ${err.status}）：${err.message}`;
}

// ---------- IndexedDB wrapper (falls back to in-memory for Node tests) ----------
export function createMemoryKV() {
  const map = new Map();
  return {
    async get(k) { return map.has(k) ? structuredClone(map.get(k)) : undefined; },
    async set(k, v) { map.set(k, structuredClone(v)); },
    async del(k) { map.delete(k); },
  };
}

export function createBrowserKV(dbName = 'itemvault-db') {
  if (typeof indexedDB === 'undefined') return createMemoryKV();
  let dbp = null;
  const open = () => {
    if (dbp) return dbp;
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore('kv'); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
    return dbp;
  };
  const fallback = createMemoryKV();
  const txRun = async (mode, fn) => {
    const db = await open();
    if (!db) return fn(null);
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  return {
    async get(k) {
      const db = await open();
      if (!db) return fallback.get(k);
      return txRun('readonly', (s) => s.get(k));
    },
    async set(k, v) {
      const db = await open();
      if (!db) return fallback.set(k, v);
      return txRun('readwrite', (s) => s.put(v, k));
    },
    async del(k) {
      const db = await open();
      if (!db) return fallback.del(k);
      return txRun('readwrite', (s) => s.delete(k));
    },
  };
}

function toBase64(str) {
  const bytes = te.encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(String(b64 || '').replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return td.decode(bytes);
}

// ---------- GitHub Git Data Backend ----------
export class GitHubBackend {
  constructor({ owner, repo, branch = 'main', token, apiBase = 'https://api.github.com' }) {
    Object.assign(this, { owner, repo, branch, token, apiBase: apiBase.replace(/\/$/, '') });
    this.rp = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  }

  async req(path, { method = 'GET', body } = {}) {
    const headers = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (body) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(this.apiBase + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
    } catch {
      throw new NetworkError('无法连接 GitHub，已保存在本地离线队列');
    }
    if (!res.ok) {
      let msg = res.statusText;
      try { const j = await res.json(); msg = j.message || msg; } catch { /* ignore */ }
      throw new ApiError(res.status, msg);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async readFileText(path, ref) {
    try {
      const j = await this.req(`${this.rp}/contents/${path}?ref=${encodeURIComponent(ref)}`);
      return fromBase64(j.content || '');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  }

  async pullSnapshot() {
    const ref = await this.req(`${this.rp}/git/ref/heads/${encodeURIComponent(this.branch)}`);
    const headSha = ref.object.sha;
    const commit = await this.req(`${this.rp}/git/commits/${headSha}`);
    const treeSha = commit.tree.sha;
    const [itemsTxt, locsTxt, histTxt] = await Promise.all([
      this.readFileText('items.json', headSha),
      this.readFileText('locations.json', headSha),
      this.readFileText('history.jsonl', headSha),
    ]);
    const itemsDoc = itemsTxt ? JSON.parse(itemsTxt) : { version: 1, updated_at: nowISO(), items: [] };
    const locsDoc = locsTxt ? JSON.parse(locsTxt) : { version: 1, updated_at: nowISO(), locations: [] };
    return { headSha, treeSha, itemsDoc, locsDoc, historyText: histTxt || '' };
  }

  async commitFiles(parentSha, baseTreeSha, files, message) {
    const treeEntries = [];
    for (const f of files) {
      const blob = await this.req(`${this.rp}/git/blobs`, {
        method: 'POST',
        body: { content: toBase64(f.content), encoding: 'base64' },
      });
      treeEntries.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const tree = await this.req(`${this.rp}/git/trees`, {
      method: 'POST',
      body: { base_tree: baseTreeSha, tree: treeEntries },
    });
    const commit = await this.req(`${this.rp}/git/commits`, {
      method: 'POST',
      body: { message, tree: tree.sha, parents: [parentSha] },
    });
    await this.req(`${this.rp}/git/refs/heads/${encodeURIComponent(this.branch)}`, {
      method: 'PATCH',
      body: { sha: commit.sha, force: false },
    });
    return commit.sha;
  }
}

// ---------- Demo dataset (shown only before connecting private GitHub repo) ----------
export function demoSnapshot() {
  const today = todayISO();
  const addDays = (n) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  return {
    itemsDoc: {
      version: 1,
      updated_at: nowISO(),
      items: [
        {
          id: 'I-0001',
          name: '化学护目镜',
          aliases: ['护目镜', '安全眼镜', 'goggles'],
          desc: '透明防雾款，可套近视镜',
          domain: '科研个人装备',
          category: '防护装备',
          item_type: 'durable',
          tags: ['实验'],
          qty: 1,
          unit: '副',
          unopened_qty: 0,
          min_qty: 0,
          home_location: '办公室 > 铁柜 > 第2层 [O-01]',
          current_location: '实验室 > 个人抽屉 [L-01]',
          quick_spots: ['办公室 > 铁柜 > 第2层 [O-01]', '实验室 > 个人抽屉 [L-01]', '随身 > 随身包 > 通勤包 [B-01]'],
          status: 'in_use',
          added_at: addDays(-60),
          last_used_at: addDays(-2),
          verified_at: addDays(-2),
          idle_review_days: 90,
          use_by: null,
          remind_use_on: addDays(3),
          need_buy: false,
          remind_buy_on: null,
          buy_note: '',
          curation: 'curated',
          notebook_meta: null,
        },
        {
          id: 'I-0002',
          name: '泳裤',
          aliases: ['游泳裤', '泳装'],
          desc: '深蓝平角款，和泳镜放一起',
          domain: '穿搭运动',
          category: '游泳装备',
          item_type: 'seasonal',
          tags: ['游泳'],
          qty: 1,
          unit: '条',
          unopened_qty: 0,
          min_qty: 0,
          home_location: '家 > 衣柜 > 运动抽屉 [H-01]',
          current_location: '家 > 衣柜 > 运动抽屉 [H-01]',
          quick_spots: ['家 > 衣柜 > 运动抽屉 [H-01]', '随身 > 随身包 > 通勤包 [B-01]'],
          status: 'in_use',
          added_at: addDays(-120),
          last_used_at: addDays(-35),
          verified_at: addDays(-35),
          idle_review_days: 180,
          use_by: null,
          remind_use_on: null,
          need_buy: false,
          remind_buy_on: null,
          buy_note: '',
          curation: 'curated',
          notebook_meta: null,
        },
        {
          id: 'I-0003',
          name: '考试易错点专用本',
          aliases: ['错题本', '要点本'],
          desc: '蓝色牛皮纸 A5 线圈本',
          domain: '实体本子',
          category: '学习笔记',
          item_type: 'notebook',
          tags: ['笔记'],
          qty: 1,
          unit: '本',
          unopened_qty: 0,
          min_qty: 0,
          home_location: '办公室 > 书架 > 第1层 [O-02]',
          current_location: '办公室 > 书架 > 第1层 [O-02]',
          quick_spots: ['办公室 > 书架 > 第1层 [O-02]', '家 > 书桌 > 右抽屉 [H-02]'],
          status: 'in_use',
          added_at: addDays(-90),
          last_used_at: addDays(-10),
          verified_at: addDays(-10),
          idle_review_days: 180,
          use_by: null,
          remind_use_on: null,
          need_buy: false,
          remind_buy_on: null,
          buy_note: '',
          curation: 'curated',
          notebook_meta: {
            code: 'NB-01',
            cover: '蓝色牛皮纸 A5 线圈本',
            topics: ['考试要点', '易错题'],
            contents_summary: '前半本为要点归纳，后半本为刷题错题记录',
            state: 'active',
            archived_to_enotes: false,
            enotes_ref: '',
          },
        },
        {
          id: 'I-0004',
          name: '挂耳咖啡（浅烘）',
          aliases: ['咖啡', '手冲挂耳'],
          desc: '开封盒装，尽快喝完防受潮',
          domain: '生活',
          category: '饮品咖啡',
          item_type: 'consumable',
          tags: ['咖啡'],
          qty: 6,
          unit: '包',
          unopened_qty: 0,
          min_qty: 2,
          home_location: '家 > 厨房 > 吊柜 [H-03]',
          current_location: '家 > 厨房 > 吊柜 [H-03]',
          quick_spots: ['家 > 厨房 > 吊柜 [H-03]'],
          status: 'in_use',
          added_at: addDays(-40),
          last_used_at: addDays(-4),
          verified_at: addDays(-4),
          idle_review_days: 45,
          use_by: addDays(5),
          remind_use_on: null,
          need_buy: false,
          remind_buy_on: null,
          buy_note: '',
          curation: 'curated',
          notebook_meta: null,
        },
        {
          id: 'I-0005',
          name: '防晒霜 SPF50+',
          aliases: ['防晒', '隔离'],
          desc: '大促多囤了 2 支，买前别再重复下单',
          domain: '生活',
          category: '护肤洗护',
          item_type: 'consumable',
          tags: ['护肤'],
          qty: 2,
          unit: '支',
          unopened_qty: 2,
          min_qty: 0,
          home_location: '家 > 卫生间 > 镜柜 [H-04]',
          current_location: '家 > 卫生间 > 镜柜 [H-04]',
          quick_spots: ['家 > 卫生间 > 镜柜 [H-04]'],
          status: 'unused',
          added_at: addDays(-75),
          last_used_at: null,
          verified_at: addDays(-75),
          idle_review_days: 60,
          use_by: addDays(25),
          remind_use_on: null,
          need_buy: false,
          remind_buy_on: null,
          buy_note: '',
          curation: 'curated',
          notebook_meta: null,
        },
        {
          id: 'I-0006',
          name: '隐形眼镜护理液',
          aliases: ['护理液'],
          desc: '快见底了，下次买小瓶便携装',
          domain: '生活',
          category: '日用消耗',
          item_type: 'consumable',
          tags: ['日用'],
          qty: 1,
          unit: '瓶',
          unopened_qty: 0,
          min_qty: 1,
          home_location: '家 > 卫生间 > 镜柜 [H-04]',
          current_location: '家 > 卫生间 > 镜柜 [H-04]',
          quick_spots: ['家 > 卫生间 > 镜柜 [H-04]'],
          status: 'low',
          added_at: addDays(-50),
          last_used_at: addDays(-1),
          verified_at: addDays(-1),
          idle_review_days: 60,
          use_by: null,
          remind_use_on: null,
          need_buy: true,
          remind_buy_on: addDays(2),
          buy_note: '买 120 mL 便携装',
          curation: 'curated',
          notebook_meta: null,
        },
      ],
    },
    locsDoc: {
      version: 1,
      updated_at: nowISO(),
      locations: [
        { code: 'H-01', site: '家', zone: '衣柜', container: '运动抽屉', label: '家 > 衣柜 > 运动抽屉 [H-01]' },
        { code: 'H-02', site: '家', zone: '书桌', container: '右抽屉', label: '家 > 书桌 > 右抽屉 [H-02]' },
        { code: 'H-03', site: '家', zone: '厨房', container: '吊柜', label: '家 > 厨房 > 吊柜 [H-03]' },
        { code: 'H-04', site: '家', zone: '卫生间', container: '镜柜', label: '家 > 卫生间 > 镜柜 [H-04]' },
        { code: 'O-01', site: '办公室', zone: '铁柜', container: '第2层', label: '办公室 > 铁柜 > 第2层 [O-01]' },
        { code: 'O-02', site: '办公室', zone: '书架', container: '第1层', label: '办公室 > 书架 > 第1层 [O-02]' },
        { code: 'L-01', site: '实验室', zone: '个人抽屉', container: '默认', label: '实验室 > 个人抽屉 [L-01]' },
        { code: 'B-01', site: '随身', zone: '随身包', container: '通勤包', label: '随身 > 随身包 > 通勤包 [B-01]' },
      ],
    },
  };
}

// ---------- VaultStore: Offline-First State + Mutation Outbox ----------
export class VaultStore {
  constructor({ kv = createBrowserKV(), backendFactory = (cfg) => new GitHubBackend(cfg) } = {}) {
    this.kv = kv;
    this.backendFactory = backendFactory;
    this.config = null;
    this.backend = null;
    this.mode = 'demo';
    this.state = demoSnapshot();
    this.outbox = [];
    this.syncState = 'demo'; // demo | idle | syncing | offline | error
    this.lastError = '';
    this.lastErrorCode = null;
    this.lastSyncedAt = null;
    this.listeners = new Set();
    this._flushing = null;
  }

  get isReadOnly() {
    return this.mode === 'github' && Boolean(this.config?.readOnly);
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this);
  }

  async init() {
    const cfg = await this.kv.get('config');
    const cached = await this.kv.get('cache');
    const outbox = (await this.kv.get('outbox')) || [];
    this.outbox = Array.isArray(outbox) ? outbox : [];

    if (cfg && cfg.owner && cfg.repo && cfg.token) {
      this.config = { ...cfg, readOnly: Boolean(cfg.readOnly) };
      this.backend = this.backendFactory(this.config);
      this.mode = 'github';
      if (this.config.readOnly && this.outbox.length) {
        this.outbox = [];
        await this.kv.set('outbox', []);
      }
      if (cached && cached.itemsDoc && cached.locsDoc) {
        this.state = { itemsDoc: cached.itemsDoc, locsDoc: cached.locsDoc };
        this.lastSyncedAt = cached.syncedAt || null;
      } else {
        this.state = { itemsDoc: { version: 1, updated_at: nowISO(), items: [] }, locsDoc: { version: 1, updated_at: nowISO(), locations: [] } };
      }
      this.syncState = this.outbox.length ? 'offline' : 'idle';
      this.emit();
      await this.sync();
    } else {
      this.mode = 'demo';
      if (cached && cached.demo && cached.itemsDoc && cached.locsDoc) {
        this.state = { itemsDoc: cached.itemsDoc, locsDoc: cached.locsDoc };
      } else {
        this.state = demoSnapshot();
      }
      this.syncState = 'demo';
      this.emit();
    }
  }

  async connect(cfg) {
    const clean = {
      owner: String(cfg.owner || 'crtwmv2f9v-spec').trim(),
      repo: String(cfg.repo || 'item-vault-data').trim(),
      branch: String(cfg.branch || 'main').trim() || 'main',
      token: String(cfg.token || '').trim(),
      readOnly: Boolean(cfg.readOnly),
    };
    if (!clean.token) throw new Error('请输入 GitHub Token');
    const backend = this.backendFactory(clean);
    let snap;
    try {
      snap = await backend.pullSnapshot();
    } catch (e) {
      if (e instanceof ApiError) throw new ApiError(e.status, formatApiError(e, 'read'));
      throw e;
    }
    this.config = clean;
    this.backend = backend;
    this.mode = 'github';
    this.outbox = [];
    this.state = { itemsDoc: snap.itemsDoc, locsDoc: snap.locsDoc };
    this.lastSyncedAt = nowISO();
    this.syncState = 'idle';
    this.lastError = '';
    this.lastErrorCode = null;
    await this.kv.set('config', clean);
    await this.kv.set('outbox', []);
    await this.kv.set('cache', { itemsDoc: snap.itemsDoc, locsDoc: snap.locsDoc, syncedAt: this.lastSyncedAt });
    this.emit();
  }

  async switchDemo() {
    this.config = null;
    this.backend = null;
    this.mode = 'demo';
    this.outbox = [];
    this.state = demoSnapshot();
    this.syncState = 'demo';
    this.lastError = '';
    this.lastErrorCode = null;
    await this.kv.del('config');
    await this.kv.set('outbox', []);
    await this.kv.set('cache', { demo: true, itemsDoc: this.state.itemsDoc, locsDoc: this.state.locsDoc });
    this.emit();
  }

  async discardOutboxAndSync() {
    if (this.mode !== 'github' || !this.backend) return;
    this.outbox = [];
    this.lastError = '';
    this.lastErrorCode = null;
    await this.kv.set('outbox', []);
    this.emit();
    await this.sync();
  }

  async setReadOnly(enabled) {
    if (this.mode !== 'github' || !this.config) return;
    this.config = { ...this.config, readOnly: Boolean(enabled) };
    await this.kv.set('config', this.config);
    if (this.config.readOnly) {
      this.outbox = [];
      this.lastError = '';
      this.lastErrorCode = null;
      await this.kv.set('outbox', []);
      this.emit();
      await this.sync();
    } else {
      this.emit();
    }
  }

  async dispatch(type, payload) {
    if (this.isReadOnly) return null;
    const op = {
      opId: `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      ts: nowISO(),
      type,
      payload,
    };
    applyOp(this.state, op);
    if (this.mode === 'demo') {
      await this.kv.set('cache', { demo: true, itemsDoc: this.state.itemsDoc, locsDoc: this.state.locsDoc });
      this.emit();
      return op;
    }
    this.outbox.push(op);
    await this.kv.set('outbox', this.outbox);
    await this.kv.set('cache', { itemsDoc: this.state.itemsDoc, locsDoc: this.state.locsDoc, syncedAt: this.lastSyncedAt });
    this.emit();
    this.flush();
    return op;
  }

  async sync() {
    if (this.mode !== 'github' || !this.backend) return;
    if (!this.isReadOnly && this.outbox.length) return this.flush();
    this.syncState = 'syncing';
    this.lastError = '';
    this.lastErrorCode = null;
    this.emit();
    try {
      const snap = await this.backend.pullSnapshot();
      // Re-check outbox in case user dispatched while pulling
      if (!this.isReadOnly && this.outbox.length) return this.flush();
      this.state = { itemsDoc: snap.itemsDoc, locsDoc: snap.locsDoc };
      this.lastSyncedAt = nowISO();
      this.syncState = 'idle';
      this.lastError = '';
      this.lastErrorCode = null;
      await this.kv.set('cache', { itemsDoc: snap.itemsDoc, locsDoc: snap.locsDoc, syncedAt: this.lastSyncedAt });
    } catch (e) {
      if (e instanceof NetworkError) {
        this.syncState = 'offline';
        this.lastError = e.message;
        this.lastErrorCode = null;
      } else {
        this.syncState = 'error';
        this.lastErrorCode = e instanceof ApiError ? e.status : null;
        this.lastError = formatApiError(e, 'read');
      }
    }
    this.emit();
  }

  async flush() {
    if (this.mode !== 'github' || !this.backend || this.isReadOnly) return;
    if (this._flushing) {
      this._flushAgain = true;
      await this._flushing;
      if (this._flushAgain && this.outbox.length && this.syncState !== 'error') {
        this._flushAgain = false;
        return this.flush();
      }
      return;
    }
    this._flushAgain = false;
    this._flushing = this._doFlush().finally(() => { this._flushing = null; });
    return this._flushing;
  }

  async _doFlush() {
    if (!this.outbox.length || this.isReadOnly) return;
    this.syncState = 'syncing';
    this.lastError = '';
    this.lastErrorCode = null;
    this.emit();

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const batch = [...this.outbox];
      if (!batch.length) { this.syncState = 'idle'; this.emit(); return; }
      try {
        const snap = await this.backend.pullSnapshot();
        const merged = {
          itemsDoc: structuredClone(snap.itemsDoc),
          locsDoc: structuredClone(snap.locsDoc),
        };
        const newHistLines = [];
        for (const op of batch) {
          const h = applyOp(merged, op);
          if (h) newHistLines.push(JSON.stringify(h));
        }
        const histContent = snap.historyText
          ? `${snap.historyText.replace(/\n*$/, '')}\n${newHistLines.join('\n')}\n`
          : (newHistLines.length ? `${newHistLines.join('\n')}\n` : '');
        const files = [
          { path: 'items.json', content: `${JSON.stringify(merged.itemsDoc, null, 2)}\n` },
          { path: 'locations.json', content: `${JSON.stringify(merged.locsDoc, null, 2)}\n` },
        ];
        if (newHistLines.length) files.push({ path: 'history.jsonl', content: histContent });

        const msg = batch.length === 1
          ? `PWA: ${batch[0].type}`
          : `PWA: ${batch.length} updates (${batch[0].type}...)`;

        await this.backend.commitFiles(snap.headSha, snap.treeSha, files, msg);

        // Remove flushed ops, preserve any newly queued ops dispatched mid-flight
        const flushedIds = new Set(batch.map((o) => o.opId));
        this.outbox = this.outbox.filter((o) => !flushedIds.has(o.opId));
        for (const extra of this.outbox) applyOp(merged, extra);
        this.state = merged;
        this.lastSyncedAt = nowISO();
        this.syncState = this.outbox.length ? 'syncing' : 'idle';
        this.lastError = '';
        this.lastErrorCode = null;
        await this.kv.set('outbox', this.outbox);
        await this.kv.set('cache', { itemsDoc: merged.itemsDoc, locsDoc: merged.locsDoc, syncedAt: this.lastSyncedAt });
        this.emit();
        if (!this.outbox.length) return;
      } catch (e) {
        if (e instanceof ApiError && (e.status === 409 || e.status === 422) && attempt + 1 < maxRetries) {
          continue;
        }
        if (e instanceof NetworkError) {
          this.syncState = 'offline';
          this.lastError = e.message;
          this.lastErrorCode = null;
        } else {
          this.syncState = 'error';
          this.lastErrorCode = e instanceof ApiError ? e.status : null;
          this.lastError = formatApiError(e, 'write');
        }
        this.emit();
        return;
      }
    }
  }
}
