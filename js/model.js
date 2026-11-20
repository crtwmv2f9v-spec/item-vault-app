// Pure domain model & deterministic mutation reducer for ItemVault.
// Zero DOM dependencies so it can be tested directly in Node.js.

export const VALID_TYPES = ['durable', 'notebook', 'consumable', 'seasonal'];
export const TYPE_LABELS = {
  durable: '耐用常备',
  notebook: '实体本子',
  consumable: '消耗/囤货',
  seasonal: '季节/场景',
};
export const SITE_PREFIX = {
  '家': 'H',
  '家里': 'H',
  '宿舍': 'H',
  '办公室': 'O',
  '工位': 'O',
  '实验室': 'L',
  '随身': 'B',
  '随身包': 'B',
  '包': 'B',
};
export const DEFAULT_IDLE_DAYS = {
  durable: 120,
  notebook: 180,
  consumable: 60,
  seasonal: 180,
};

export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function nowISO(now = new Date()) {
  const off = -now.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
  const mm = String(Math.abs(off) % 60).padStart(2, '0');
  const d = todayISO(now);
  const t = [now.getHours(), now.getMinutes(), now.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
  return `${d}T${t}${sign}${hh}:${mm}`;
}

export function daysBetween(d1, d2) {
  if (!d1 || !d2) return null;
  const a = new Date(`${d1}T00:00:00Z`).getTime();
  const b = new Date(`${d2}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

export function validDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function splitList(val) {
  if (!val) return [];
  if (Array.isArray(val)) return [...new Set(val.map((x) => String(x).trim()).filter(Boolean))];
  return [...new Set(String(val).split(/[,，、;；]+/).map((x) => x.trim()).filter(Boolean))];
}

export function extractCode(locStr) {
  const m = String(locStr || '').match(/\[([A-Za-z0-9_-]+)\]/);
  return m ? m[1].toUpperCase() : '';
}

export function parseLocationParts(locStr) {
  const s = String(locStr || '').replace(/\s+/g, ' ').trim();
  const code = extractCode(s);
  const clean = s.replace(/\s*\[[A-Za-z0-9_-]+\]\s*/, '').trim();
  const parts = clean.split(/[>/＞→]+/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return { site: '其他', zone: '未分格', container: '默认', code };
  const site = parts[0] === '家里' ? '家' : parts[0];
  const zone = parts[1] || '未分格';
  const container = parts.length >= 3 ? parts.slice(2).join(' / ') : '默认';
  return { site, zone, container, code };
}

export function ensureLocation(locsDoc, locStr) {
  const raw = String(locStr || '').trim();
  if (!raw) return '';
  const locs = locsDoc.locations || (locsDoc.locations = []);
  if (/^[A-Za-z]{1,2}-[A-Za-z0-9]{1,6}$/.test(raw)) {
    const found = locs.find((l) => String(l.code || '').toUpperCase() === raw.toUpperCase());
    if (found) return found.label;
  }
  const codeIn = extractCode(raw);
  if (codeIn) {
    const found = locs.find((l) => String(l.code || '').toUpperCase() === codeIn);
    if (found) return found.label;
  }
  const { site, zone, container, code: parsedCode } = parseLocationParts(raw);
  const same = locs.find((l) => l.site === site && l.zone === zone && l.container === container);
  if (same) return same.label;
  let code = parsedCode;
  if (!code) {
    const prefix = SITE_PREFIX[site] || 'X';
    const used = new Set(locs.map((l) => String(l.code || '').toUpperCase()));
    let n = 1;
    while (used.has(`${prefix}-${String(n).padStart(2, '0')}`)) n += 1;
    code = `${prefix}-${String(n).padStart(2, '0')}`;
  }
  const label = `${site} > ${zone} > ${container} [${code}]`;
  locs.push({ code, site, zone, container, label });
  return label;
}

export function nextItemId(items) {
  let mx = 0;
  for (const it of items) {
    const m = String(it.id || '').match(/^I-(\d+)$/);
    if (m) mx = Math.max(mx, parseInt(m[1], 10));
  }
  return `I-${String(mx + 1).padStart(4, '0')}`;
}

export function nextNotebookCode(items) {
  let mx = 0;
  for (const it of items) {
    const m = String(it.notebook_meta?.code || '').match(/^NB-(\d+)$/);
    if (m) mx = Math.max(mx, parseInt(m[1], 10));
  }
  return `NB-${String(mx + 1).padStart(2, '0')}`;
}

export function itemBlob(it) {
  const nb = it.notebook_meta || {};
  return [
    it.id, it.name, ...(it.aliases || []), it.desc, it.domain, it.category,
    ...(it.tags || []), it.home_location, it.current_location, it.buy_note,
    nb.code, nb.cover, ...(nb.topics || []), nb.contents_summary,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function matchScore(it, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return 1;
  const tokens = q.split(/\s+/).filter(Boolean);
  const blob = itemBlob(it);
  if (!tokens.every((t) => blob.includes(t))) return 0;
  let score = 10;
  const name = String(it.name || '').toLowerCase();
  const aliases = (it.aliases || []).map((a) => String(a).toLowerCase());
  if (q === name || aliases.includes(q)) score += 100;
  else if (name.includes(q)) score += 60;
  else if (aliases.some((a) => a.includes(q))) score += 45;
  else if (String(it.current_location || '').toLowerCase().includes(q)) score += 25;
  return score;
}

export function findDuplicates(items, name, aliases = [], category = '') {
  const terms = new Set();
  for (const s of [name, ...splitList(aliases)]) {
    const t = String(s || '').trim().toLowerCase();
    if (t.length >= 2) terms.add(t);
  }
  const out = [];
  for (const it of items) {
    if (it.status === 'retired') continue;
    const itName = String(it.name || '').toLowerCase();
    const itAliases = (it.aliases || []).map((a) => String(a).toLowerCase());
    let reason = '';
    for (const t of terms) {
      if (t === itName || itAliases.includes(t)) { reason = '同名/别名命中'; break; }
      if (itName.includes(t) || t.includes(itName) || itAliases.some((a) => a.includes(t) || t.includes(a))) {
        reason = '名称相近'; break;
      }
    }
    if (!reason && category && it.category === category && ((it.unopened_qty || 0) > 0 || it.status === 'unused')) {
      reason = `同分类(${category})已有未使用/未拆封囤货`;
    }
    if (reason) out.push({ reason, item: it });
  }
  return out;
}

export function buildRecord(raw, items, locsDoc, today = todayISO()) {
  const itemType = VALID_TYPES.includes(raw.item_type) ? raw.item_type : 'durable';
  const home = ensureLocation(locsDoc, raw.home_location || raw.location || '家 > 未分格 > 默认 [H-00]');
  const curr = ensureLocation(locsDoc, raw.current_location || home);
  const quick = [];
  for (const s of [home, curr, ...(raw.quick_spots || [])]) {
    if (s && !quick.includes(s)) quick.push(s);
  }
  const qty = Math.max(0, Number(raw.qty ?? 1) || 0);
  const unopened = Math.max(0, Math.min(qty, Number(raw.unopened_qty ?? 0) || 0));
  const minQty = Math.max(0, Number(raw.min_qty ?? 0) || 0);
  let status = raw.status;
  if (!status) {
    if (qty <= 0) status = 'used_up';
    else if (unopened > 0 && unopened >= qty) status = 'unused';
    else status = 'in_use';
  }
  let nbMeta = null;
  if (itemType === 'notebook') {
    const nb = raw.notebook_meta || {};
    nbMeta = {
      code: nb.code || nextNotebookCode(items),
      cover: String(nb.cover || '').trim(),
      topics: splitList(nb.topics),
      contents_summary: String(nb.contents_summary || '').trim(),
      state: nb.state || 'active',
      archived_to_enotes: Boolean(nb.archived_to_enotes),
      enotes_ref: String(nb.enotes_ref || '').trim(),
    };
  }
  return {
    id: raw.id || nextItemId(items),
    name: String(raw.name || '').trim(),
    aliases: splitList(raw.aliases),
    desc: String(raw.desc || '').trim(),
    domain: String(raw.domain || (itemType === 'notebook' ? '实体本子' : '生活')).trim(),
    category: String(raw.category || '未分类').trim(),
    item_type: itemType,
    tags: splitList(raw.tags),
    qty,
    unit: String(raw.unit || (itemType === 'notebook' ? '本' : '件')).trim(),
    unopened_qty: unopened,
    min_qty: minQty,
    home_location: home,
    current_location: curr,
    quick_spots: quick,
    status,
    added_at: validDate(raw.added_at) || today,
    last_used_at: validDate(raw.last_used_at),
    verified_at: validDate(raw.verified_at) || today,
    idle_review_days: Number(raw.idle_review_days) || DEFAULT_IDLE_DAYS[itemType],
    use_by: validDate(raw.use_by),
    remind_use_on: validDate(raw.remind_use_on),
    need_buy: Boolean(raw.need_buy) || (minQty > 0 && qty <= minQty),
    remind_buy_on: validDate(raw.remind_buy_on),
    buy_note: String(raw.buy_note || '').trim(),
    curation: raw.curation === 'raw' ? 'raw' : 'curated',
    notebook_meta: nbMeta,
  };
}

// Pure deterministic reducer for offline outbox replay.
export function applyOp(state, op) {
  const itemsDoc = state.itemsDoc;
  const locsDoc = state.locsDoc;
  const items = itemsDoc.items || (itemsDoc.items = []);
  const today = (op.ts || '').slice(0, 10) || todayISO();
  const p = op.payload || {};
  const findById = (id) => items.find((x) => x.id === id);
  let hist = null;

  switch (op.type) {
    case 'add_item': {
      // Idempotency guard if opId was already applied or explicit id already exists
      if (p.id && findById(p.id)) break;
      const rec = buildRecord(p, items, locsDoc, today);
      items.push(rec);
      hist = { ts: op.ts, op: 'add', id: rec.id, name: rec.name, qty: rec.qty, loc: rec.current_location };
      break;
    }
    case 'update_item': {
      const it = findById(p.id);
      if (!it) break;
      const patch = p.patch || {};
      if (patch.name !== undefined) it.name = String(patch.name).trim() || it.name;
      if (patch.desc !== undefined) it.desc = String(patch.desc).trim();
      if (patch.aliases !== undefined) it.aliases = splitList(patch.aliases);
      if (patch.domain !== undefined) it.domain = String(patch.domain).trim() || it.domain;
      if (patch.category !== undefined) it.category = String(patch.category).trim() || it.category;
      if (patch.item_type && VALID_TYPES.includes(patch.item_type)) it.item_type = patch.item_type;
      if (patch.tags !== undefined) it.tags = splitList(patch.tags);
      if (patch.qty !== undefined) it.qty = Math.max(0, Number(patch.qty) || 0);
      if (patch.unit !== undefined) it.unit = String(patch.unit).trim() || it.unit;
      if (patch.unopened_qty !== undefined) it.unopened_qty = Math.max(0, Math.min(it.qty, Number(patch.unopened_qty) || 0));
      if (patch.min_qty !== undefined) it.min_qty = Math.max(0, Number(patch.min_qty) || 0);
      if (patch.home_location) it.home_location = ensureLocation(locsDoc, patch.home_location);
      if (patch.current_location) it.current_location = ensureLocation(locsDoc, patch.current_location);
      if (patch.use_by !== undefined) it.use_by = validDate(patch.use_by);
      if (patch.remind_use_on !== undefined) it.remind_use_on = validDate(patch.remind_use_on);
      if (patch.need_buy !== undefined) it.need_buy = Boolean(patch.need_buy);
      if (patch.remind_buy_on !== undefined) it.remind_buy_on = validDate(patch.remind_buy_on);
      if (patch.buy_note !== undefined) it.buy_note = String(patch.buy_note).trim();
      if (patch.idle_review_days !== undefined) it.idle_review_days = Math.max(1, Number(patch.idle_review_days) || 90);
      if (patch.status) it.status = patch.status;
      if (patch.curation) it.curation = patch.curation;
      if (it.item_type === 'notebook') {
        const nb = { ...(it.notebook_meta || {}), ...(patch.notebook_meta || {}) };
        if (!nb.code) nb.code = nextNotebookCode(items);
        nb.topics = splitList(nb.topics);
        nb.archived_to_enotes = Boolean(nb.archived_to_enotes);
        it.notebook_meta = nb;
      } else if (patch.item_type && patch.item_type !== 'notebook') {
        it.notebook_meta = null;
      }
      it.verified_at = today;
      hist = { ts: op.ts, op: 'edit', id: it.id };
      break;
    }
    case 'move_item': {
      const it = findById(p.id);
      if (!it || !p.location) break;
      const from = it.current_location;
      const to = ensureLocation(locsDoc, p.location);
      it.current_location = to;
      if (p.set_home) it.home_location = to;
      if (!Array.isArray(it.quick_spots)) it.quick_spots = [];
      if (!it.quick_spots.includes(to)) it.quick_spots.push(to);
      it.verified_at = today;
      hist = { ts: op.ts, op: 'move', id: it.id, from, to };
      break;
    }
    case 'return_home': {
      const it = findById(p.id);
      if (!it) break;
      const from = it.current_location;
      it.current_location = it.home_location || from;
      it.verified_at = today;
      hist = { ts: op.ts, op: 'return_home', id: it.id, from, to: it.current_location };
      break;
    }
    case 'qty_delta': {
      const it = findById(p.id);
      if (!it) break;
      const from = Number(it.qty || 0);
      const to = Math.max(0, from + Number(p.delta || 0));
      it.qty = to;
      if ((it.unopened_qty || 0) > to) it.unopened_qty = to;
      if (to === 0) it.status = 'used_up';
      else if (it.status === 'used_up') it.status = 'in_use';
      if ((it.min_qty || 0) > 0 && to <= it.min_qty) it.need_buy = true;
      it.verified_at = today;
      hist = { ts: op.ts, op: 'qty', id: it.id, from, to };
      break;
    }
    case 'mark_used': {
      const it = findById(p.id);
      if (!it) break;
      it.last_used_at = today;
      it.verified_at = today;
      if (it.status === 'unused') it.status = 'in_use';
      if (p.open_one && (it.unopened_qty || 0) > 0) it.unopened_qty -= 1;
      if (p.dec) {
        it.qty = Math.max(0, (it.qty || 0) - Number(p.dec));
        if (it.qty === 0) it.status = 'used_up';
        if ((it.min_qty || 0) > 0 && it.qty <= it.min_qty) it.need_buy = true;
      }
      hist = { ts: op.ts, op: 'use', id: it.id, dec: Number(p.dec || 0) };
      break;
    }
    case 'verify_item': {
      const it = findById(p.id);
      if (!it) break;
      it.verified_at = today;
      hist = { ts: op.ts, op: 'verify', target: it.id, count: 1 };
      break;
    }
    case 'verify_container': {
      const code = String(p.code || '').toUpperCase();
      let count = 0;
      for (const it of items) {
        if (it.status !== 'retired' && extractCode(it.current_location) === code) {
          it.verified_at = today;
          count += 1;
        }
      }
      hist = { ts: op.ts, op: 'verify', target: code, count };
      break;
    }
    case 'toggle_buy': {
      const it = findById(p.id);
      if (!it) break;
      const next = p.need_buy !== undefined ? Boolean(p.need_buy) : !it.need_buy;
      it.need_buy = next;
      if (!next) it.remind_buy_on = null;
      if (p.remind_buy_on !== undefined) it.remind_buy_on = validDate(p.remind_buy_on);
      if (p.buy_note !== undefined) it.buy_note = String(p.buy_note).trim();
      hist = { ts: op.ts, op: 'buy_flag', id: it.id, need_buy: it.need_buy };
      break;
    }
    case 'mark_bought': {
      const it = findById(p.id);
      if (!it) break;
      const addQ = Number(p.qty ?? 1) || 1;
      it.qty = (it.qty || 0) + addQ;
      if (p.unopened) it.unopened_qty = (it.unopened_qty || 0) + addQ;
      it.need_buy = false;
      it.remind_buy_on = null;
      if (it.status === 'used_up' || it.status === 'low') it.status = p.unopened ? 'unused' : 'in_use';
      it.verified_at = today;
      hist = { ts: op.ts, op: 'bought', id: it.id, added: addQ, qty: it.qty };
      break;
    }
    case 'toggle_archived_enotes': {
      const it = findById(p.id);
      if (!it || !it.notebook_meta) break;
      it.notebook_meta.archived_to_enotes = !it.notebook_meta.archived_to_enotes;
      it.verified_at = today;
      hist = { ts: op.ts, op: 'enotes_toggle', id: it.id, archived: it.notebook_meta.archived_to_enotes };
      break;
    }
    case 'retire_item': {
      const it = findById(p.id);
      if (!it) break;
      it.status = 'retired';
      it.need_buy = false;
      it.remind_use_on = null;
      it.remind_buy_on = null;
      hist = { ts: op.ts, op: 'retire', id: it.id, name: it.name };
      break;
    }
    default:
      break;
  }
  itemsDoc.updated_at = op.ts || nowISO();
  locsDoc.updated_at = itemsDoc.updated_at;
  return hist;
}

// View selectors
export function getActiveItems(items) {
  return (items || []).filter((it) => it.status !== 'retired');
}

export function getExpiringItems(items, today = todayISO()) {
  return getActiveItems(items)
    .filter((it) => it.use_by && it.status !== 'used_up' && (it.qty || 0) > 0)
    .map((it) => ({ item: it, daysLeft: daysBetween(today, it.use_by) }))
    .filter((x) => x.daysLeft !== null)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export function getIdleRadar(items, today = todayISO()) {
  const unopened = [];
  const idle = [];
  const unverified = [];
  for (const it of getActiveItems(items)) {
    if ((it.qty || 0) <= 0) continue;
    if ((it.unopened_qty || 0) > 0 || it.status === 'unused') {
      unopened.push(it);
      continue;
    }
    const ref = it.last_used_at || it.added_at;
    const gap = daysBetween(ref, today);
    const lim = Number(it.idle_review_days) || DEFAULT_IDLE_DAYS[it.item_type] || 120;
    if (gap !== null && gap >= lim) {
      idle.push({ item: it, idleDays: gap });
      continue;
    }
    const vgap = daysBetween(it.verified_at || it.added_at, today);
    if (vgap !== null && vgap >= 180) {
      unverified.push({ item: it, days: vgap });
    }
  }
  idle.sort((a, b) => b.idleDays - a.idleDays);
  unverified.sort((a, b) => b.days - a.days);
  return { unopened, idle, unverified };
}

export function getToBuyItems(items) {
  return getActiveItems(items).filter(
    (it) => it.need_buy || ((it.min_qty || 0) > 0 && (it.qty || 0) <= it.min_qty) || it.remind_buy_on,
  );
}

export function getNotebooks(items) {
  return getActiveItems(items)
    .filter((it) => it.item_type === 'notebook')
    .sort((a, b) => String(a.notebook_meta?.code || '').localeCompare(String(b.notebook_meta?.code || '')));
}

export function getContainerGroups(items, locations = []) {
  const byCode = new Map();
  for (const loc of locations) {
    byCode.set(String(loc.code || '').toUpperCase(), { ...loc, items: [] });
  }
  for (const it of getActiveItems(items)) {
    const code = extractCode(it.current_location) || 'UNASSIGNED';
    if (!byCode.has(code)) {
      const parts = parseLocationParts(it.current_location);
      byCode.set(code, {
        code,
        site: parts.site,
        zone: parts.zone,
        container: parts.container,
        label: it.current_location || '未分格',
        items: [],
      });
    }
    byCode.get(code).items.push(it);
  }
  return [...byCode.values()].sort((a, b) => {
    if (b.items.length !== a.items.length) return b.items.length - a.items.length;
    return String(a.code).localeCompare(String(b.code));
  });
}
