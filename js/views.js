// UI views, inline SVG icons & modals for ItemVault PWA.

import {
  DOMAIN_BY_NAME,
  TAXONOMY,
  TYPE_LABELS,
  classifyText,
  defaultCategoryForDomain,
  extractCode,
  findDuplicates,
  getActiveItems,
  getContainerGroups,
  getDomainStats,
  getExpiringItems,
  getIdleRadar,
  getNotebooks,
  getSubcategoriesForDomain,
  getToBuyItems,
  matchScore,
  parseLocationParts,
  resolveItemTaxonomy,
  todayISO,
} from './model.js';
import { parseQuickText } from './parser.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Minimal warm line-art SVG icons (zero external dependencies) ----------
const SVG_ATTR = 'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

export const ICONS = {
  search: `<svg class="ic" viewBox="0 0 24 24" ${SVG_ATTR}><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>`,
  expiring: `<svg class="ic" viewBox="0 0 24 24" ${SVG_ATTR}><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M9 2h6"/></svg>`,
  idle: `<svg class="ic" viewBox="0 0 24 24" ${SVG_ATTR}><path d="M4 9.5L12 5l8 4.5v7L12 21l-8-4.5z"/><path d="M4 9.5L12 14l8-4.5"/><path d="M12 14v7"/></svg>`,
  buy: `<svg class="ic" viewBox="0 0 24 24" ${SVG_ATTR}><path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>`,
  map: `<svg class="ic" viewBox="0 0 24 24" ${SVG_ATTR}><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>`,
  gear: `<svg class="ic" viewBox="0 0 24 24" ${SVG_ATTR}><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.08a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  pin: `<svg class="ic ic-sm" viewBox="0 0 24 24" ${SVG_ATTR}><path d="M12 21s6-5.4 6-10.2A6 6 0 1 0 6 10.8C6 15.6 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.2"/></svg>`,
  sun: `<svg class="ic ic-sm" viewBox="0 0 24 24" ${SVG_ATTR}><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  moon: `<svg class="ic ic-sm" viewBox="0 0 24 24" ${SVG_ATTR}><path d="M20.2 14.5A8 8 0 1 1 9.5 3.8a6.5 6.5 0 0 0 10.7 10.7z"/></svg>`,
  auto: `<svg class="ic ic-sm" viewBox="0 0 24 24" ${SVG_ATTR}><circle cx="12" cy="12" r="8"/><path d="M12 4v16"/><path d="M12 8.5a3.5 3.5 0 0 1 0 7"/></svg>`,
  warmHome: `<svg class="ic ic-warm" viewBox="0 0 24 24" ${SVG_ATTR}><path d="M4 11L12 4.5 20 11v8.2a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 19.2z"/><path d="M8.5 14h7"/><path d="M9.5 17.5h5"/><circle cx="12" cy="10.2" r="1.4"/></svg>`,
  shelfEmpty: `<svg class="ic-empty" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 28L32 13l20 15v23a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V28z"/><path d="M19 37h26"/><rect x="21" y="42" width="22" height="8" rx="3"/><circle cx="32" cy="46" r="1.5" fill="currentColor"/><path d="M24 37v-6a2 2 0 0 1 2-2h3v8M35 37v-8h4a2 2 0 0 1 2 2v6"/></svg>`,
};

const DOMAIN_ICONS = {
  digital: `<svg class="ic ic-dom" viewBox="0 0 24 24" ${SVG_ATTR}><rect x="3.5" y="5" width="17" height="11.5" rx="2"/><path d="M2 19.5h20"/></svg>`,
  home: `<svg class="ic ic-dom" viewBox="0 0 24 24" ${SVG_ATTR}><path d="M4 10.8L12 4.5l8 6.3V19a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 19z"/><path d="M9.5 20.8v-6.3h5v6.3"/></svg>`,
  care: `<svg class="ic ic-dom" viewBox="0 0 24 24" ${SVG_ATTR}><path d="M12 4.5c3.8 4.4 6 7.4 6 10a6 6 0 1 1-12 0c0-2.6 2.2-5.6 6-10z"/><path d="M10 15.5a2.3 2.3 0 0 0 2.5 1.8"/></svg>`,
  food: `<svg class="ic ic-dom" viewBox="0 0 24 24" ${SVG_ATTR}><path d="M5 10h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5v-5z"/><path d="M16 11h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M8.5 6.5c0-1 .8-1.5.8-2.5M12.5 6.5c0-1 .8-1.5.8-2.5"/></svg>`,
  apparel: `<svg class="ic ic-dom" viewBox="0 0 24 24" ${SVG_ATTR}><path d="M8.5 5L5 7.5l2 3.5 2-1v9.5h6V10l2 1 2-3.5L15.5 5a3.5 3.5 0 0 1-7 0z"/></svg>`,
  stationery: `<svg class="ic ic-dom" viewBox="0 0 24 24" ${SVG_ATTR}><path d="M5 4.5h11a2.5 2.5 0 0 1 2.5 2.5v12.5H7.5A2.5 2.5 0 0 1 5 17z"/><path d="M9 8.5h6M9 12h4.5"/><path d="M5 17h13.5"/></svg>`,
  research: `<svg class="ic ic-dom" viewBox="0 0 24 24" ${SVG_ATTR}><path d="M9 3.5h6"/><path d="M10.2 3.5v5.6l-4.7 8.2A2.2 2.2 0 0 0 7.4 20.5h9.2a2.2 2.2 0 0 0 1.9-3.2l-4.7-8.2V3.5"/><path d="M8.2 14.5h7.6"/></svg>`,
  other: `<svg class="ic ic-dom" viewBox="0 0 24 24" ${SVG_ATTR}><path d="M4.5 9.5h15v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z"/><path d="M3.5 6.5h17v3h-17z"/><path d="M10 13.5h4"/></svg>`,
};

export function domainIcon(key) {
  return DOMAIN_ICONS[key] || DOMAIN_ICONS.other;
}

export function buildTokenUrl(owner, readOnly = true) {
  const p = new URLSearchParams({
    name: readOnly ? 'ItemVault (read-only search)' : 'ItemVault (this device)',
    description: readOnly
      ? 'Read-only search access to the personal inventory repository.'
      : 'Read and write access to the personal inventory repository.',
    expires_in: '366',
    contents: readOnly ? 'read' : 'write',
  });
  if (owner) p.set('target_name', owner);
  return `https://github.com/settings/personal-access-tokens/new?${p}`;
}

export function renderSyncBadge(store) {
  if (store.mode === 'demo') return '<span class="sync-pill demo">演示模式</span>';
  if (store.syncState === 'syncing') return '<span class="sync-pill syncing">同步中…</span>';
  if (store.syncState === 'error') {
    const label = store.outbox.length > 0 ? `同步异常 (${store.outbox.length})` : '同步异常';
    return `<button class="sync-pill err" data-act="open-settings">${label}</button>`;
  }
  if (store.outbox.length > 0) return `<button class="sync-pill offline" data-act="sync-now">待同步 ${store.outbox.length}</button>`;
  if (store.syncState === 'offline') return `<button class="sync-pill offline" data-act="sync-now">${store.isReadOnly ? '只读离线' : '离线'}</button>`;
  return `<button class="sync-pill ok" data-act="sync-now">${store.isReadOnly ? '只读已同步' : '已同步'}</button>`;
}

export function toast(msg, action = null) {
  const el = document.getElementById('toast');
  if (!el) return;
  if (action && action.act && action.label) {
    el.innerHTML = `<span>${esc(msg)}</span><button type="button" class="toast-act" data-act="${esc(action.act)}" data-id="${esc(action.id || '')}">${esc(action.label)}</button>`;
  } else {
    el.textContent = msg;
  }
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2600);
}

function formatLocationHtml(locStr) {
  if (!locStr) return '<span>未填位置</span>';
  const code = extractCode(locStr);
  const { site, zone, container } = parseLocationParts(locStr);
  const segs = [site, zone, container].filter((x, idx) => x && !(idx === 2 && x === '默认'));
  const pretty = segs.length ? segs.join(' › ') : locStr;
  return `<span class="loc-path">${esc(pretty)}</span>${code ? `<span class="loc-code-chip">${esc(code)}</span>` : ''}`;
}

function badgesFor(it, today, opts = {}) {
  const out = [];
  if (it.source === 'preset') out.push('<span class="badge badge-preset">预填</span>');
  else if (opts.showSourceBadge) out.push('<span class="badge badge-user">自填</span>');
  if (it.notebook_meta?.code) out.push(`<span class="badge badge-nb">${esc(it.notebook_meta.code)}</span>`);
  if (it.current_location && it.home_location && it.current_location !== it.home_location) {
    out.push('<span class="badge badge-away">带出中</span>');
  }
  if ((it.unopened_qty || 0) > 0) {
    out.push(`<span class="badge badge-unopened">未拆 ${esc(it.unopened_qty)}</span>`);
  } else if (it.status === 'unused') {
    out.push('<span class="badge badge-unopened">未使用</span>');
  }
  if (it.use_by && it.status !== 'used_up' && (it.qty || 0) > 0) {
    const d = Math.round((new Date(`${it.use_by}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000);
    const cls = d <= 7 ? 'badge-danger' : (d <= 30 ? 'badge-warn' : 'badge-ok');
    const txt = d < 0 ? `逾期${-d}天` : (d === 0 ? '今日截止' : `剩${d}天`);
    out.push(`<span class="badge ${cls}">限期 ${txt}</span>`);
  }
  if (it.need_buy || ((it.min_qty || 0) > 0 && (it.qty || 0) <= it.min_qty)) {
    out.push('<span class="badge badge-buy">待买</span>');
  }
  if (it.remind_use_on) out.push(`<span class="badge badge-info">用:${esc(it.remind_use_on.slice(5))}</span>`);
  if (it.curation === 'raw') out.push('<span class="badge badge-raw">待整理</span>');
  return out.join('');
}

export function renderItemCard(it, today, opts = {}) {
  const readOnly = Boolean(opts.readOnly);
  const isPreset = it.source === 'preset';
  const tax = resolveItemTaxonomy(it);
  const away = it.home_location && it.current_location && it.home_location !== it.current_location;
  const loc = it.current_location || it.home_location || '';
  const qtyText = `${it.qty ?? 0}${it.unit || '件'}`;
  const nb = it.notebook_meta;
  const nbLine = nb
    ? `<div class="card-nb">${esc(nb.cover || '实体本子')}${nb.topics?.length ? ` · ${esc(nb.topics.join('、'))}` : ''} · <strong>${nb.archived_to_enotes ? '已归档 e-notes' : '未电子化'}</strong></div>`
    : '';
  const extraLine = opts.extraNote ? `<div class="card-extra">${esc(opts.extraNote)}</div>` : '';
  const statusBadges = badgesFor(it, today, opts);

  return `
    <article class="card dom-${esc(tax.key)}${isPreset ? ' is-preset' : ''}" data-id="${esc(it.id)}" data-domain="${esc(tax.domain)}">
      <div class="card-head">
        <div class="card-title-row">
          <button class="card-title" data-act="open-edit" data-id="${esc(it.id)}">${esc(it.name)}</button>
          <span class="qty-pill">${esc(qtyText)}</span>
        </div>
        <div class="badges">
          <span class="tax-pill dom-${esc(tax.key)}">${domainIcon(tax.key)}<span>${esc(tax.domain)}</span>${tax.category ? `<span class="tax-sep">·</span><span>${esc(tax.category)}</span>` : ''}</span>
          ${statusBadges}
        </div>
      </div>
      <div class="card-loc">
        <span class="loc-ic">${ICONS.pin}</span>
        ${formatLocationHtml(loc)}
        ${away ? `<span class="home-hint">常驻 ${esc(extractCode(it.home_location) || it.home_location)}</span>` : ''}
      </div>
      ${it.desc ? `<div class="card-desc">${esc(it.desc)}</div>` : ''}
      ${nbLine}
      ${extraLine}
      ${readOnly ? '' : `
      <div class="card-actions">
        ${isPreset ? `<button class="btn-chip btn-remove" data-act="quick-remove" data-id="${esc(it.id)}">我没有</button><button class="btn-chip btn-sage" data-act="confirm-preset" data-id="${esc(it.id)}">确认已有</button>` : ''}
        <button class="btn-chip" data-act="open-clone" data-id="${esc(it.id)}">+补位置</button>
        <button class="btn-chip" data-act="open-move" data-id="${esc(it.id)}">换位置</button>
        ${away ? `<button class="btn-chip btn-accent" data-act="return-home" data-id="${esc(it.id)}">归位</button>` : ''}
        ${(it.item_type === 'consumable' || (it.qty || 0) > 1) ? `<button class="btn-chip" data-act="dec" data-id="${esc(it.id)}">-1</button>` : ''}
        <button class="btn-chip" data-act="use" data-id="${esc(it.id)}">刚用过</button>
        ${opts.showBought
          ? `<button class="btn-chip btn-accent" data-act="bought" data-id="${esc(it.id)}">已买到入库</button>`
          : `<button class="btn-chip ${it.need_buy ? 'btn-active' : ''}" data-act="toggle-buy" data-id="${esc(it.id)}">${it.need_buy ? '取消待买' : '加采购'}</button>`}
        ${nb ? `<button class="btn-chip" data-act="toggle-enotes" data-id="${esc(it.id)}">${nb.archived_to_enotes ? '标未归档' : '已归档e-notes'}</button>` : ''}
        ${opts.showVerify ? `<button class="btn-chip btn-accent" data-act="verify" data-id="${esc(it.id)}">核实位置</button>` : ''}
      </div>`}
    </article>`;
}

export function renderWelcomeStrip(store) {
  const today = todayISO();
  const items = store.state.itemsDoc.items || [];
  const active = getActiveItems(items);
  const stats = getDomainStats(items);
  const activeDomainCount = stats.filter((d) => d.count > 0).length;
  const expCount = getExpiringItems(items, today).filter((x) => x.daysLeft <= 30).length;
  const buyCount = getToBuyItems(items).length;
  const awayCount = active.filter((it) => it.home_location && it.current_location && it.home_location !== it.current_location).length;
  const rawCount = active.filter((it) => it.curation === 'raw').length;
  const presetCount = active.filter((it) => it.source === 'preset').length;
  const userCount = active.length - presetCount;

  const h = new Date().getHours();
  const greet = h < 11 ? '晨光清透，万物各归其位' : (h < 18 ? '手边私藏，秩序井然' : '夜色流光，藏品一目了然');

  const pills = [];
  if (expCount > 0) pills.push(`<button class="calm-pill is-danger" data-act="nav" data-route="expiring">临期 ${expCount}</button>`);
  if (buyCount > 0) pills.push(`<button class="calm-pill is-warn" data-act="nav" data-route="buy">待买 ${buyCount}</button>`);
  if (awayCount > 0) pills.push(`<button class="calm-pill is-info" data-act="set-filter" data-filter="away" data-reset-domain="1">带出 ${awayCount}</button>`);
  if (rawCount > 0) pills.push(`<button class="calm-pill is-neutral" data-act="set-filter" data-filter="raw" data-reset-domain="1">待整理 ${rawCount}</button>`);
  if (presetCount > 0) pills.push(`<button class="calm-pill is-preset" data-act="set-filter" data-filter="preset" data-reset-domain="1">预填 ${presetCount}</button>`);
  if (!pills.length) pills.push('<span class="calm-pill is-ok">一切清爽</span>');

  const subText = presetCount > 0
    ? `在库 <strong>${active.length}</strong> 件（自填 <strong>${userCount}</strong> · 预填 <strong>${presetCount}</strong>）· <strong>${activeDomainCount}</strong> 个分类`
    : `在库 <strong>${active.length}</strong> 件 · <strong>${activeDomainCount}</strong> 个分类`;

  return `
    <div class="welcome-strip">
      <div class="welcome-lead">
        <span class="welcome-emblem">${ICONS.warmHome}</span>
        <div class="welcome-copy">
          <div class="welcome-title">${greet}</div>
          <div class="welcome-sub">${subText}</div>
        </div>
      </div>
      <div class="welcome-pills">${pills.join('')}</div>
    </div>`;
}

export function renderDomainFilterRow(store, ui) {
  const active = getActiveItems(store.state.itemsDoc.items);
  const stats = getDomainStats(store.state.itemsDoc.items);
  const df = ui.domainFilter || 'all';
  return `
    <button class="dom-chip ${df === 'all' ? 'active' : ''}" data-act="set-domain" data-domain="all" aria-pressed="${df === 'all'}">
      <span>全部分类</span><span class="chip-cnt">${active.length}</span>
    </button>
    ${stats.map((d) => `
      <button class="dom-chip dom-${esc(d.key)} ${df === d.name ? 'active' : ''} ${d.count === 0 ? 'is-zero' : ''}" data-act="set-domain" data-domain="${esc(d.name)}" aria-pressed="${df === d.name}">
        ${domainIcon(d.key)}<span>${esc(d.name)}</span>${d.count > 0 ? `<span class="chip-cnt">${d.count}</span>` : ''}
      </button>`).join('')}`;
}

export function normalizeCategoryFilter(items, ui) {
  const df = ui.domainFilter || 'all';
  const cf = ui.categoryFilter || 'all';
  if (df === 'all' || cf === 'all') return 'all';
  const active = getActiveItems(items);
  const stillExists = active.some((it) => {
    const tax = resolveItemTaxonomy(it);
    return tax.domain === df && tax.category === cf;
  });
  if (!stillExists) {
    ui.categoryFilter = 'all';
    return 'all';
  }
  return cf;
}

export function renderSubcatFilterRow(store, ui) {
  const df = ui.domainFilter || 'all';
  if (df === 'all') return '';
  const items = store.state.itemsDoc.items;
  const cf = normalizeCategoryFilter(items, ui);
  const stats = getDomainStats(items);
  const dom = stats.find((d) => d.name === df);
  if (!dom || dom.topSubs.length <= 1) return '';
  return `
    <div class="chip-row subcat-row">
      <button class="sub-chip ${cf === 'all' ? 'active' : ''}" data-act="set-category" data-category="all" aria-pressed="${cf === 'all'}">全部${esc(dom.short)} (${dom.count})</button>
      ${dom.topSubs.map((s) => `
        <button class="sub-chip ${cf === s.name ? 'active' : ''}" data-act="set-category" data-category="${esc(s.name)}" aria-pressed="${cf === s.name}">${esc(s.name)} (${s.count})</button>`).join('')}
    </div>`;
}

export function renderSpaceFilterRow(store, ui) {
  const f = ui.searchFilter || 'all';
  const filters = [
    { id: 'all', label: '全部地点' },
    { id: 'user', label: '自填' },
    { id: 'preset', label: '预填' },
    { id: 'home', label: '家' },
    { id: 'office', label: '办公室' },
    { id: 'lab', label: '实验室' },
    { id: 'carry', label: '随身' },
    { id: 'notebook', label: '本子' },
    { id: 'away', label: '带出未归位' },
    { id: 'raw', label: '待整理' },
  ];
  return filters.map((x) => `<button class="filter-chip ${f === x.id ? 'active' : ''}" data-act="set-filter" data-filter="${x.id}" aria-pressed="${f === x.id}">${esc(x.label)}</button>`).join('');
}

export function renderSearchResults(store, ui) {
  const today = todayISO();
  const readOnly = Boolean(store.isReadOnly);
  const active = getActiveItems(store.state.itemsDoc.items);
  const hasPreset = active.some((it) => it.source === 'preset');
  const q = ui.searchQuery || '';
  const f = ui.searchFilter || 'all';
  const df = ui.domainFilter || 'all';
  const cf = normalizeCategoryFilter(store.state.itemsDoc.items, ui);

  const filtered = active
    .filter((it) => {
      const tax = resolveItemTaxonomy(it);
      if (df !== 'all' && tax.domain !== df) return false;
      if (df !== 'all' && cf !== 'all' && tax.category !== cf) return false;
      const loc = `${it.current_location || ''} ${it.home_location || ''}`;
      if (f === 'user') return it.source !== 'preset';
      if (f === 'preset') return it.source === 'preset';
      if (f === 'home') return loc.includes('家') || loc.includes('宿舍');
      if (f === 'office') return loc.includes('办公室') || loc.includes('工位');
      if (f === 'lab') return loc.includes('实验室');
      if (f === 'carry') return loc.includes('随身') || loc.includes('通勤包');
      if (f === 'notebook') return it.item_type === 'notebook';
      if (f === 'away') return it.home_location && it.current_location && it.home_location !== it.current_location;
      if (f === 'raw') return it.curation === 'raw';
      return true;
    })
    .map((it) => ({ it, sc: matchScore(it, q) }))
    .filter((x) => x.sc > 0)
    .sort((a, b) => (b.sc - a.sc) || a.it.id.localeCompare(b.it.id));

  const hasFilter = df !== 'all' || f !== 'all' || Boolean(q.trim());

  if (filtered.length) {
    const bar = hasFilter
      ? `<div class="result-meta"><span>找到 ${filtered.length} 件物品</span><button class="link-btn" data-act="reset-filters">重置筛选</button></div>`
      : '';
    return `${bar}<div class="card-list">${filtered.map(({ it }) => renderItemCard(it, today, { readOnly, showSourceBadge: hasPreset })).join('')}</div>`;
  }

  return `
    <div class="empty-box">
      <div class="empty-art">${ICONS.shelfEmpty}</div>
      <p>${active.length ? (q ? `没有找到匹配「${esc(q)}」的物品` : '当前筛选条件下还没有物品') : '物品库还是空的，放进第一件常备好物吧'}</p>
      <div class="empty-actions">
        ${hasFilter ? '<button class="btn-chip" data-act="reset-filters">查看全部物品</button>' : ''}
        ${readOnly ? '' : '<button class="btn-primary" data-act="open-add">+ 录入物品</button>'}
      </div>
    </div>`;
}

export function renderSearchView(store, ui) {
  const q = ui.searchQuery || '';
  return `
    <section class="panel">
      <div id="home-summary-slot">${renderWelcomeStrip(store)}</div>
      <div class="search-box">
        <span class="search-ic">${ICONS.search}</span>
        <input id="search-input" type="search" placeholder="搜名称、别名、分类或容器码…" value="${esc(q)}" autocomplete="off" />
        <button id="search-clear" class="clear-btn" data-act="clear-search" aria-label="清空"${q ? '' : ' hidden'}>✕</button>
      </div>
      <div class="filter-group">
        <div id="domain-bar-slot" class="chip-row dom-row">${renderDomainFilterRow(store, ui)}</div>
        <div id="subcat-bar-slot">${renderSubcatFilterRow(store, ui)}</div>
        <div id="space-bar-slot" class="chip-row space-row">${renderSpaceFilterRow(store, ui)}</div>
      </div>
      <div id="search-results">${renderSearchResults(store, ui)}</div>
    </section>`;
}

export function renderExpiringView(store) {
  const today = todayISO();
  const readOnly = Boolean(store.isReadOnly);
  const items = store.state.itemsDoc.items;
  const hasPreset = getActiveItems(items).some((it) => it.source === 'preset');
  const list = getExpiringItems(items, today);
  return `
    <section class="panel">
      <div class="sec-head">
        <h2>限期用完队列</h2>
        <span class="muted">按目标期限倒计时排序 · 自动同步 iCloud 日历「物品提醒」</span>
      </div>
      ${list.length
        ? `<div class="card-list">${list.map(({ item, daysLeft }) => {
            const note = daysLeft < 0 ? `已超出目标日期 ${-daysLeft} 天（${item.use_by}）`
              : (daysLeft === 0 ? `今天是目标期限（${item.use_by}）` : `距离目标期限 ${item.use_by} 还有 ${daysLeft} 天`);
            return renderItemCard(item, today, { extraNote: note, readOnly, showSourceBadge: hasPreset });
          }).join('')}</div>`
        : `<div class="empty-box"><div class="empty-art">${ICONS.shelfEmpty}</div><p>暂无设置限期用完（use_by）的物品，安心慢用。</p></div>`}
    </section>`;
}

export function renderIdleView(store) {
  const today = todayISO();
  const readOnly = Boolean(store.isReadOnly);
  const items = store.state.itemsDoc.items;
  const hasPreset = getActiveItems(items).some((it) => it.source === 'preset');
  const { unopened, idle, unverified } = getIdleRadar(items, today);
  return `
    <section class="panel">
      <div class="sec-head">
        <h2>吃灰与防买重雷达</h2>
        <span class="muted">下单前扫一眼，把家里已有的先用起来</span>
      </div>
      <h3 class="subhead">未拆封 / 未使用囤货（${unopened.length}）</h3>
      ${unopened.length
        ? `<div class="card-list">${unopened.map((it) => renderItemCard(it, today, { extraNote: `未拆封 ${it.unopened_qty || it.qty}${it.unit || '件'}，优先消耗`, readOnly, showSourceBadge: hasPreset })).join('')}</div>`
        : '<p class="muted-empty">暂无未拆封囤货。</p>'}

      <h3 class="subhead">超期吃灰（${idle.length}）</h3>
      ${idle.length
        ? `<div class="card-list">${idle.map(({ item, idleDays }) => renderItemCard(item, today, { extraNote: `已 ${idleDays} 天未记录使用`, readOnly, showSourceBadge: hasPreset })).join('')}</div>`
        : '<p class="muted-empty">暂无超期吃灰物品。</p>'}

      <h3 class="subhead">超 180 天未核实位置（${unverified.length}）</h3>
      ${unverified.length
        ? `<div class="card-list">${unverified.map(({ item, days }) => renderItemCard(item, today, { extraNote: `上次核实位置已过去 ${days} 天`, showVerify: true, readOnly, showSourceBadge: hasPreset })).join('')}</div>`
        : '<p class="muted-empty">所有物品位置均在 180 天内核实过。</p>'}
    </section>`;
}

export function renderBuyView(store) {
  const today = todayISO();
  const readOnly = Boolean(store.isReadOnly);
  const items = store.state.itemsDoc.items;
  const hasPreset = getActiveItems(items).some((it) => it.source === 'preset');
  const list = getToBuyItems(items);
  return `
    <section class="panel">
      <div class="sec-head">
        <h2>采购与补货清单（${list.length}）</h2>
        <span class="muted">指定日当日提醒 · 未指定日自动汇总至每周日 iCloud 日历</span>
      </div>
      ${list.length
        ? `<div class="card-list">${list.map((it) => {
            const parts = [];
            if (it.remind_buy_on) parts.push(`提醒购买日：${it.remind_buy_on}`);
            if (it.buy_note) parts.push(`备注：${it.buy_note}`);
            if ((it.unopened_qty || 0) > 0) parts.push(`注意：库中还有 ${it.unopened_qty} 件未拆封`);
            return renderItemCard(it, today, { extraNote: parts.join(' | '), showBought: true, readOnly, showSourceBadge: hasPreset });
          }).join('')}</div>`
        : `<div class="empty-box"><div class="empty-art">${ICONS.shelfEmpty}</div><p>当前没有待采购或低库存物品，家中常备充足。</p></div>`}
    </section>`;
}

export function renderMapView(store, locCode = '') {
  const today = todayISO();
  const readOnly = Boolean(store.isReadOnly);
  const items = store.state.itemsDoc.items;
  const hasPreset = getActiveItems(items).some((it) => it.source === 'preset');
  const groups = getContainerGroups(items, store.state.locsDoc.locations);

  if (locCode) {
    const code = locCode.toUpperCase();
    const grp = groups.find((g) => String(g.code).toUpperCase() === code);
    const matched = grp ? grp.items : [];
    return `
      <section class="panel">
        <div class="loc-detail-head">
          <button class="btn-chip" data-act="go-map">← 返回分类与容器</button>
          ${readOnly ? '' : `<button class="btn-chip btn-accent" data-act="verify-container" data-code="${esc(code)}">整格核实 (${matched.length}件)</button>`}
        </div>
        <h2 class="loc-detail-title"><span class="code-pill">${esc(code)}</span> ${esc(grp?.label || code)}</h2>
        ${matched.length
          ? `<div class="card-list">${matched.map((it) => renderItemCard(it, today, { readOnly, showSourceBadge: hasPreset })).join('')}</div>`
          : `<div class="empty-box"><div class="empty-art">${ICONS.shelfEmpty}</div><p>该容器内当前没有物品。</p></div>`}
      </section>`;
  }

  const domainStats = getDomainStats(items);
  const nbs = getNotebooks(items);
  return `
    <section class="panel">
      <div class="sec-head">
        <h2>科学分类目录（${TAXONOMY.length} 大类）</h2>
        <span class="muted">按功能域正交划分 · 点击直接浏览该类物品</span>
      </div>
      <div class="domain-grid">
        ${domainStats.map((d) => {
          const previewSubs = d.topSubs.length
            ? d.topSubs.slice(0, 3).map((s) => `${s.name} ${s.count}`).join(' · ')
            : d.subcategories.slice(0, 3).join(' · ');
          return `
            <button class="domain-tile dom-${esc(d.key)} ${d.count === 0 ? 'is-empty' : ''}" data-act="open-domain" data-domain="${esc(d.name)}">
              <div class="domain-tile-top">
                <span class="domain-tile-ic">${domainIcon(d.key)}</span>
                <span class="domain-tile-cnt">${d.count} 件</span>
              </div>
              <div class="domain-tile-name">${esc(d.name)}</div>
              <div class="domain-tile-desc">${esc(d.desc)}</div>
              <div class="domain-tile-subs">${esc(previewSubs)}</div>
            </button>`;
        }).join('')}
      </div>

      <div class="sec-head" style="margin-top:14px;">
        <h2>容器地图（${groups.length}）</h2>
        <button class="btn-chip" data-act="print-labels">打印短码贴纸</button>
      </div>
      <div class="loc-grid">
        ${groups.map((g) => `
          <button class="loc-tile ${g.items.length === 0 ? 'is-empty' : ''}" data-act="open-loc" data-code="${esc(g.code)}">
            <div class="loc-tile-top">
              <span class="code-pill">${esc(g.code)}</span>
              <span class="muted">${g.items.length} 件</span>
            </div>
            <div class="loc-tile-name">${esc(g.site)} · ${esc(g.zone)}</div>
            <div class="loc-tile-sub">${esc(g.container === '默认' ? '未细分容器' : g.container)}</div>
          </button>`).join('')}
      </div>

      <div class="sec-head" style="margin-top:14px;">
        <h2>实体本子墙（${nbs.length}）</h2>
        <span class="muted">记录书脊号、封面、主题与电子化归档状态</span>
      </div>
      ${nbs.length
        ? `<div class="card-list">${nbs.map((it) => renderItemCard(it, today, { readOnly, showSourceBadge: hasPreset })).join('')}</div>`
        : '<p class="muted-empty">暂无录入的实体本子。</p>'}
    </section>`;
}

// ---------- Modals ----------

export function renderDupBanner(store, dupQuery) {
  const q = String(dupQuery || '').trim();
  const inf = q.length >= 2 ? classifyText(q) : null;
  const dups = q.length >= 2
    ? findDuplicates(store.state.itemsDoc.items, q, [], inf?.matched ? inf.category : '')
    : [];
  return dups.length
    ? `<div class="dup-alert">
         <strong>防买重 / 重复提醒：</strong>
         ${dups.slice(0, 3).map((d) => `<div>· [${esc(d.reason)}] ${esc(d.item.name)}（${esc(d.item.qty)}${esc(d.item.unit)}）@ ${esc(d.item.current_location)}</div>`).join('')}
       </div>`
    : '';
}

export function renderQuickPreviewContent(parsed) {
  return parsed ? `
    <span>名称：<b>${esc(parsed.name)}</b></span>
    <span>分类：<b>${esc(parsed.domain)} · ${esc(parsed.category)}</b></span>
    <span>数量：<b>${esc(parsed.qty)}${esc(parsed.unit)}</b></span>
    <span>地点：<b>${esc(parsed.current_location)}</b></span>
    <span>类型：<b>${esc(TYPE_LABELS[parsed.item_type])}</b></span>
    ${parsed.unopened_qty ? `<span>未拆：<b>${esc(parsed.unopened_qty)}</b></span>` : ''}
    ${parsed.use_by ? `<span>限期：<b>${esc(parsed.use_by)}</b></span>` : ''}
    ${parsed.remind_use_on ? `<span>提醒用：<b>${esc(parsed.remind_use_on)}</b></span>` : ''}
    ${parsed.need_buy ? `<span><b>待买${parsed.remind_buy_on ? ` (${esc(parsed.remind_buy_on)})` : ''}</b></span>` : ''}
  ` : '<span class="muted">输入物品、数量、存放地点即可，自动识别科学分类并本地即时可搜。</span>';
}

export function renderFormTaxHint(name, opts = {}) {
  const s = String(name || '').trim();
  const explicitDom = String(opts.domain || '').trim();
  const explicitCat = String(opts.category || '').trim();
  const explicitType = String(opts.itemType || '').trim();
  if (!s && !explicitDom && !explicitCat && !explicitType) {
    return '<span class="muted">提交时将按名称自动识别分类、管理类型与默认单位，也可在下方手动指定。</span>';
  }
  const inf = classifyText(s, explicitType);
  const itemType = explicitType || inf.item_type;
  const domain = explicitDom || (itemType === 'notebook' ? '文具本册' : inf.domain);
  let category;
  if (explicitCat && explicitCat !== '未分类') {
    category = explicitCat;
  } else if (inf.matched && inf.domain === domain) {
    category = inf.category;
  } else {
    category = defaultCategoryForDomain(domain, itemType);
  }
  const meta = DOMAIN_BY_NAME[domain];
  const labelPrefix = explicitDom || explicitCat ? '分类预览' : '自动归类';
  return `
    <span class="tax-pill dom-${esc(meta?.key || 'other')}">${domainIcon(meta?.key || 'other')}<span>${labelPrefix}：${esc(domain)} · ${esc(category)}</span></span>
    <span class="badge badge-raw">${esc(TYPE_LABELS[itemType] || itemType)}</span>`;
}

export function renderQuickAddModal(store, state) {
  const seed = state.formSeed || null;
  const tab = seed ? 'form' : (state.addTab || 'quick');
  const rawText = state.quickText || '';
  const parsed = tab === 'quick' ? parseQuickText(rawText) : null;
  const dupQuery = tab === 'quick' ? (parsed?.name || '') : (state.formName || '');
  const locs = store.state.locsDoc.locations || [];
  const allDefaultSubs = [...new Set([
    ...TAXONOMY.flatMap((d) => d.subcategories),
    ...getActiveItems(store.state.itemsDoc.items).map((it) => resolveItemTaxonomy(it).category).filter(Boolean),
  ])];

  return `
    <div class="modal-backdrop" data-act="close-backdrop">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>${seed ? '补充同款位置' : '极简录入'}</h3>
          <button class="icon-btn" data-act="close-modal" aria-label="关闭">✕</button>
        </div>
        ${seed
          ? `<div class="clone-hint">已有位置：<b>${esc(seed.existingLoc)}</b>（请填写另一件的存放位置）</div>`
          : `<div class="seg-tabs">
               <button class="${tab === 'quick' ? 'active' : ''}" data-act="add-tab" data-tab="quick">一句话速录</button>
               <button class="${tab === 'form' ? 'active' : ''}" data-act="add-tab" data-tab="form">4 格表单</button>
             </div>`}
        ${seed ? '' : `<div id="add-dup-banner">${renderDupBanner(store, dupQuery)}</div>`}
        ${tab === 'quick' ? `
          <form id="quick-add-form" class="form-stack">
            <textarea id="quick-text" rows="3" placeholder="例：化学护目镜 1副 放实验室个人抽屉 可套近视镜&#10;例：挂耳咖啡 2袋 家厨房柜 12月15日前用完 1袋未拆">${esc(rawText)}</textarea>
            <div id="quick-preview" class="preview-box">
              ${renderQuickPreviewContent(parsed)}
            </div>
            <div class="modal-foot">
              <button type="button" class="btn-chip" data-act="close-modal">取消</button>
              <button type="submit" class="btn-primary">立即入库</button>
            </div>
          </form>
        ` : `
          <form id="form-add-form" class="form-stack">
            <label>物品名称 *<input id="form-add-name" name="name" required value="${esc(state.formName || '')}" placeholder="如：化学护目镜 / 泳裤 / 驾考错题本" /></label>
            <div id="form-tax-hint" class="tax-hint">${renderFormTaxHint(state.formName || '', seed ? { domain: seed.domain, category: seed.category, itemType: seed.item_type } : {})}</div>
            <label>描述<input name="desc" value="${esc(seed?.desc || '')}" placeholder="颜色、型号、特点或备注（如：客厅备用 / 主卧款）" /></label>
            <div class="row-2">
              <label>数量<input name="qty" type="number" step="any" min="0" value="1" /></label>
              <label>单位<input name="unit" placeholder="留空自动识别（件/台/本/包）" value="${esc(seed?.unit || '')}" /></label>
            </div>
            <label>储存地点 *
              <input name="location" list="loc-datalist" placeholder="如：家 > 卧室 > 床头柜 或 办公室铁柜" required />
              <datalist id="loc-datalist">${locs.map((l) => `<option value="${esc(l.label)}"></option>`).join('')}</datalist>
            </label>
            <details class="adv-box">
              <summary>更多选项（分类 / 类型 / 限期 / 未拆封 / 提醒 / 本子）</summary>
              <div class="form-stack" style="margin-top:10px;">
                <div class="row-2">
                  <label>一级大类
                    <select name="domain" data-cat-list="form-cat-datalist">
                      <option value="">自动识别</option>
                      ${TAXONOMY.map((d) => `<option value="${esc(d.name)}" ${seed?.domain === d.name ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
                    </select>
                  </label>
                  <label>二级子类
                    <input name="category" list="form-cat-datalist" value="${esc(seed?.category || '')}" placeholder="留空自动识别" />
                    <datalist id="form-cat-datalist">${allDefaultSubs.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>
                  </label>
                </div>
                <div class="row-2">
                  <label>管理类型
                    <select name="item_type">
                      <option value="">自动识别</option>
                      <option value="durable" ${seed?.item_type === 'durable' ? 'selected' : ''}>耐用常备</option>
                      <option value="notebook" ${seed?.item_type === 'notebook' ? 'selected' : ''}>实体本子</option>
                      <option value="consumable" ${seed?.item_type === 'consumable' ? 'selected' : ''}>消耗/囤货</option>
                      <option value="seasonal" ${seed?.item_type === 'seasonal' ? 'selected' : ''}>季节/场景</option>
                    </select>
                  </label>
                  <label>未拆封数<input name="unopened_qty" type="number" min="0" value="0" /></label>
                </div>
                <div class="row-2">
                  <label>限期用完<input name="use_by" type="date" /></label>
                  <label>提醒使用<input name="remind_use_on" type="date" /></label>
                </div>
                <div class="row-2">
                  <label>提醒购买<input name="remind_buy_on" type="date" /></label>
                  <label>低库存阈值<input name="min_qty" type="number" min="0" value="0" /></label>
                </div>
                <label class="chk-row"><input type="checkbox" name="need_buy" /> 加入采购清单</label>
                <label>本子封面/主题（实体本子选填）<input name="nb_topics" placeholder="逗号分隔主题，如：考试要点, 易错题" /></label>
              </div>
            </details>
            <div class="modal-foot">
              <button type="button" class="btn-chip" data-act="close-modal">取消</button>
              <button type="submit" class="btn-primary">保存入库</button>
            </div>
          </form>
        `}
      </div>
    </div>`;
}

export function renderMoveModal(store, itemId) {
  const it = store.state.itemsDoc.items.find((x) => x.id === itemId);
  if (!it) return '';
  const spots = [...new Set([...(it.quick_spots || []), it.home_location, ...(store.state.locsDoc.locations || []).map((l) => l.label)].filter(Boolean))];
  return `
    <div class="modal-backdrop" data-act="close-backdrop">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>移位：${esc(it.name)}</h3>
          <button class="icon-btn" data-act="close-modal" aria-label="关闭">✕</button>
        </div>
        <p class="muted" style="margin:0 0 10px;">当前：${esc(it.current_location)}</p>
        <div class="spot-list">
          ${spots.slice(0, 24).map((sp) => `
            <button class="spot-btn ${sp === it.current_location ? 'active' : ''}" data-act="do-move" data-id="${esc(it.id)}" data-loc="${esc(sp)}">
              ${sp === it.home_location ? '★ ' : ''}${esc(sp)}
            </button>`).join('')}
        </div>
        <form id="custom-move-form" class="form-stack" style="margin-top:12px;" data-id="${esc(it.id)}">
          <input name="location" placeholder="或输入新位置，如：办公室 > 抽屉 或 随身包" required />
          <label class="chk-row"><input type="checkbox" name="set_home" /> 同时设为常驻位置</label>
          <div class="modal-foot">
            <button type="button" class="btn-chip" data-act="close-modal">取消</button>
            <button type="submit" class="btn-primary">确认移位</button>
          </div>
        </form>
      </div>
    </div>`;
}

export function renderEditModal(store, itemId) {
  const it = store.state.itemsDoc.items.find((x) => x.id === itemId);
  if (!it) return '';
  const nb = it.notebook_meta || {};
  const tax = resolveItemTaxonomy(it);
  const subs = getSubcategoriesForDomain(tax.domain, store.state.itemsDoc.items);
  return `
    <div class="modal-backdrop" data-act="close-backdrop">
      <div class="modal modal-tall" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>编辑 ${esc(it.id)}</h3>
          <button class="icon-btn" data-act="close-modal" aria-label="关闭">✕</button>
        </div>
        <form id="edit-item-form" class="form-stack" data-id="${esc(it.id)}">
          <label>名称<input name="name" value="${esc(it.name)}" required /></label>
          <label>别名/同义词（逗号分隔）<input name="aliases" value="${esc((it.aliases || []).join(', '))}" /></label>
          <label>描述<input name="desc" value="${esc(it.desc || '')}" /></label>
          <div class="row-2">
            <label>一级大类
              <select name="domain" data-cat-list="edit-cat-datalist">
                ${TAXONOMY.map((d) => `<option value="${esc(d.name)}" ${tax.domain === d.name ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
              </select>
            </label>
            <label>二级子类
              <input name="category" list="edit-cat-datalist" value="${esc(tax.category || '')}" placeholder="选择或输入子类" />
              <datalist id="edit-cat-datalist">${subs.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>
            </label>
          </div>
          <div class="row-3">
            <label>数量<input name="qty" type="number" step="any" min="0" value="${esc(it.qty ?? 1)}" /></label>
            <label>单位<input name="unit" value="${esc(it.unit || '件')}" /></label>
            <label>未拆封<input name="unopened_qty" type="number" min="0" value="${esc(it.unopened_qty ?? 0)}" /></label>
          </div>
          <div class="row-2">
            <label>管理类型
              <select name="item_type">
                ${Object.entries(TYPE_LABELS).map(([k, v]) => `<option value="${k}" ${it.item_type === k ? 'selected' : ''}>${v}</option>`).join('')}
              </select>
            </label>
            <label>补货阈值<input name="min_qty" type="number" min="0" value="${esc(it.min_qty ?? 0)}" /></label>
          </div>
          <label>常驻位置<input name="home_location" value="${esc(it.home_location || '')}" /></label>
          <label>当前位置<input name="current_location" value="${esc(it.current_location || '')}" /></label>
          <div class="row-2">
            <label>限期用完<input name="use_by" type="date" value="${esc(it.use_by || '')}" /></label>
            <label>提醒使用<input name="remind_use_on" type="date" value="${esc(it.remind_use_on || '')}" /></label>
          </div>
          <div class="row-2">
            <label>提醒购买<input name="remind_buy_on" type="date" value="${esc(it.remind_buy_on || '')}" /></label>
            <label>吃灰提醒(天)<input name="idle_review_days" type="number" min="7" value="${esc(it.idle_review_days ?? 90)}" /></label>
          </div>
          <label>采购备注<input name="buy_note" value="${esc(it.buy_note || '')}" /></label>
          <label class="chk-row"><input type="checkbox" name="need_buy" ${it.need_buy ? 'checked' : ''} /> 在采购清单中</label>
          ${it.source === 'preset' ? '<label class="chk-row"><input type="checkbox" name="mark_user" /> 确认已有（转为自填，移除「预填」标记）</label>' : ''}
          ${it.curation === 'raw' ? '<label class="chk-row"><input type="checkbox" name="mark_curated" /> 标记为已整理（移除「待整理」标签）</label>' : ''}
          <div class="nb-section" id="edit-nb-section"${it.item_type === 'notebook' ? '' : ' hidden'}>
            <div class="row-2">
              <label>本子编号<input name="nb_code" value="${esc(nb.code || '')}" placeholder="留空自动分配" /></label>
              <label>封面特征<input name="nb_cover" value="${esc(nb.cover || '')}" /></label>
            </div>
            <label>主题标签（逗号分隔）<input name="nb_topics" value="${esc((nb.topics || []).join(', '))}" /></label>
            <label>内容摘要<input name="nb_summary" value="${esc(nb.contents_summary || '')}" /></label>
            <label class="chk-row"><input type="checkbox" name="nb_archived" ${nb.archived_to_enotes ? 'checked' : ''} /> 已归档至 e-notes</label>
          </div>
          <div class="modal-foot space-between">
            <button type="button" class="btn-danger" data-act="retire-item" data-id="${esc(it.id)}">归档停用</button>
            <div style="display:flex;gap:8px;">
              <button type="button" class="btn-chip" data-act="close-modal">取消</button>
              <button type="submit" class="btn-primary">保存修改</button>
            </div>
          </div>
        </form>
      </div>
    </div>`;
}

export function renderDetailModal(store, itemId) {
  const it = store.state.itemsDoc.items.find((x) => x.id === itemId);
  if (!it) return '';
  const nb = it.notebook_meta;
  const tax = resolveItemTaxonomy(it);
  const rows = [
    ['编号', it.id],
    ['来源', it.source === 'preset' ? '默认预填（待核对）' : '本人自填'],
    ['数量', `${it.qty ?? 0}${it.unit || '件'}${(it.unopened_qty || 0) > 0 ? `（未拆 ${it.unopened_qty}）` : ''}`],
    ['科学分类', `${tax.domain}${tax.category ? ` · ${tax.category}` : ''}`],
    ['管理类型', TYPE_LABELS[it.item_type] || it.item_type || ''],
    ['当前位置', it.current_location || '未填'],
    ['常驻位置', it.home_location || '未填'],
    it.aliases?.length ? ['别名', it.aliases.join('、')] : null,
    it.desc ? ['描述', it.desc] : null,
    it.use_by ? ['限期用完', it.use_by] : null,
    it.remind_use_on ? ['提醒使用', it.remind_use_on] : null,
    it.need_buy ? ['采购状态', `待买${it.remind_buy_on ? `（提醒日 ${it.remind_buy_on}）` : ''}${it.buy_note ? ` · ${it.buy_note}` : ''}`] : null,
    it.last_used_at ? ['最近使用', it.last_used_at] : null,
    it.verified_at ? ['最近核实', it.verified_at] : null,
  ].filter(Boolean);

  return `
    <div class="modal-backdrop" data-act="close-backdrop">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>${esc(it.name)}</h3>
          <button class="icon-btn" data-act="close-modal" aria-label="关闭">✕</button>
        </div>
        <div class="detail-grid">
          ${rows.map(([k, v]) => `<div class="detail-row"><span class="detail-k">${esc(k)}</span><span class="detail-v">${esc(v)}</span></div>`).join('')}
        </div>
        ${nb ? `
          <div class="nb-section" style="margin-top:10px;">
            <div><strong>实体本子 ${esc(nb.code || '')}</strong> · ${nb.archived_to_enotes ? '已归档至 e-notes' : '未电子化'}</div>
            ${nb.cover ? `<div class="muted">封面：${esc(nb.cover)}</div>` : ''}
            ${nb.topics?.length ? `<div class="muted">主题：${esc(nb.topics.join('、'))}</div>` : ''}
            ${nb.contents_summary ? `<div>${esc(nb.contents_summary)}</div>` : ''}
          </div>` : ''}
        <p class="muted" style="margin:12px 0 0;">当前为只读搜索模式，如需修改请在聊天中直接更新或在设置里关闭只读。</p>
        <div class="modal-foot">
          <button type="button" class="btn-primary" data-act="close-modal">关闭</button>
        </div>
      </div>
    </div>`;
}

export function renderSettingsStatus(store) {
  const modeLabel = store.mode === 'github'
    ? (store.isReadOnly ? '私有 GitHub 仓库（只读搜索）' : '私有 GitHub 仓库（可读写）')
    : '本地演示模式';
  return `
    <div class="status-box">
      <div>模式：<b>${modeLabel}</b></div>
      ${store.isReadOnly
        ? '<div>权限：<b>只读搜索（新增与修改请从电脑端同步）</b></div>'
        : `<div>离线队列：<b>${store.outbox.length} 条待同步</b></div>`}
      ${store.lastSyncedAt ? `<div>上次同步：${esc(store.lastSyncedAt.replace('T', ' ').slice(0, 19))}</div>` : ''}
      ${store.lastError ? `<div class="err-line">${esc(store.lastError)}</div>` : ''}
      ${store.mode === 'github' && store.outbox.length > 0 ? `
        <div class="status-actions">
          ${store.lastErrorCode === 403 ? '<button type="button" class="btn-chip btn-accent" data-act="switch-readonly">切为只读模式并拉取最新</button>' : ''}
          <button type="button" class="btn-chip" data-act="discard-outbox">放弃待同步并拉取最新</button>
        </div>` : ''}
    </div>`;
}

export function renderSettingsModal(store, theme = 'light') {
  const cfg = store.config || { owner: 'crtwmv2f9v-spec', repo: 'item-vault-data', branch: 'main', token: '', readOnly: false };
  const roUrl = buildTokenUrl(cfg.owner, true);
  const rwUrl = buildTokenUrl(cfg.owner, false);
  const themes = [
    { id: 'light', label: '晨光琉璃', ic: ICONS.sun },
    { id: 'system', label: '跟随系统', ic: ICONS.auto },
    { id: 'dark', label: '曜石流光', ic: ICONS.moon },
  ];
  return `
    <div class="modal-backdrop" data-act="close-backdrop">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>外观与同步设置</h3>
          <button class="icon-btn" data-act="close-modal" aria-label="关闭">✕</button>
        </div>
        <div class="theme-card">
          <div class="theme-card-head">
            <span class="theme-card-title">界面外观</span>
            <span class="muted">液态玻璃光学质感 · 默认晨光琉璃</span>
          </div>
          <div class="theme-seg">
            ${themes.map((t) => `
              <button type="button" class="theme-opt ${theme === t.id ? 'active' : ''}" data-act="set-theme" data-theme="${t.id}" aria-pressed="${theme === t.id}">
                ${t.ic}<span>${t.label}</span>
              </button>`).join('')}
          </div>
        </div>
        <div id="settings-status-slot">${renderSettingsStatus(store)}</div>
        <form id="settings-form" class="form-stack">
          <div class="row-2">
            <label>GitHub 用户名<input name="owner" value="${esc(cfg.owner)}" required /></label>
            <label>私有数据仓名<input name="repo" value="${esc(cfg.repo)}" required /></label>
          </div>
          <label>Fine-grained Token（仅授权该私有仓 Contents：只搜选 Read-only，需手机端修改选 Read &amp; Write）
            <input name="token" type="password" value="${esc(cfg.token || '')}" placeholder="github_pat_..." required />
          </label>
          <div class="token-links">
            <span>一键前往 GitHub 创建（选 Only select repositories → <code>${esc(cfg.repo)}</code>）：</span>
            <a href="${esc(roUrl)}" target="_blank" rel="noopener noreferrer">创建只读 Token</a>
            <span>·</span>
            <a href="${esc(rwUrl)}" target="_blank" rel="noopener noreferrer">创建读写 Token</a>
          </div>
          <label class="chk-row">
            <input type="checkbox" name="read_only" ${cfg.readOnly ? 'checked' : ''} />
            只读搜索模式（隐藏修改按钮，防误点，搭配 Read-only Token）
          </label>
          <div class="modal-foot space-between">
            <button type="button" class="btn-chip" data-act="export-json">导出 JSON</button>
            <div style="display:flex;gap:8px;">
              ${store.mode === 'github' ? '<button type="button" class="btn-chip" data-act="use-demo">切回演示</button>' : ''}
              <button type="submit" class="btn-primary">连接并同步</button>
            </div>
          </div>
        </form>
      </div>
    </div>`;
}
