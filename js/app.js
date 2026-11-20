// Entry point, router, event delegation, and PWA service worker registration.

import { getActiveItems, getExpiringItems, getIdleRadar, getToBuyItems, todayISO } from './model.js';
import { parseQuickText } from './parser.js';
import { VaultStore } from './store.js';
import {
  esc,
  renderBuyView,
  renderDetailModal,
  renderDupBanner,
  renderEditModal,
  renderExpiringView,
  renderIdleView,
  renderMapView,
  renderMoveModal,
  renderQuickAddModal,
  renderQuickPreviewContent,
  renderSearchResults,
  renderSearchView,
  renderSettingsModal,
  renderSettingsStatus,
  renderSyncBadge,
  toast,
} from './views.js';

const store = new VaultStore();
const ui = {
  route: 'search',
  locCode: '',
  searchQuery: '',
  searchFilter: 'all',
  modal: null, // null | { kind: 'add'|'move'|'edit'|'settings', ... }
  addTab: 'quick',
  quickText: '',
  formName: '',
};

const ua = navigator.userAgent || '';
const isWebKit = /AppleWebKit/i.test(ua)
  && (/iP(ad|hone|od)/i.test(ua) || !/Chrome|Chromium|Edg|OPR|Android/i.test(ua));
let imeComposing = false;
let imeTarget = null;
let imeEndedAt = 0;
let imeEndedTarget = null;
let imeEndedEvent = null;
let hasRendered = false;
let pendingStoreRender = false;
let backdropDown = false;

function isComposingActive() {
  if (imeComposing && (!imeTarget || !imeTarget.isConnected)) {
    imeComposing = false;
    imeTarget = null;
  }
  return imeComposing;
}

function isImeEvent(e) {
  if (!e) return false;
  if (e.isComposing || e.keyCode === 229 || e.which === 229 || e.key === 'Process') return true;
  if (isComposingActive()) return true;
  if (e === imeEndedEvent) return true;
  if (isWebKit && imeEndedAt && (e.key === 'Enter' || e.key === 'Escape')
    && (!imeEndedTarget || e.target === imeEndedTarget)
    && performance.now() - imeEndedAt < 80) {
    return true;
  }
  return false;
}

function isTypingElement(el = document.activeElement) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName === 'INPUT') {
    const t = (el.type || 'text').toLowerCase();
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'range', 'color', 'hidden'].includes(t);
  }
  return false;
}

function handleLiveInput(target) {
  if (!target) return;
  if (target.id === 'search-input') {
    ui.searchQuery = target.value;
    const resultsEl = document.getElementById('search-results');
    if (resultsEl) resultsEl.innerHTML = renderSearchResults(store, ui);
    const clearBtn = document.getElementById('search-clear');
    if (clearBtn) clearBtn.hidden = !ui.searchQuery;
  } else if (target.id === 'quick-text') {
    ui.quickText = target.value;
    const parsed = parseQuickText(ui.quickText);
    const prevEl = document.getElementById('quick-preview');
    if (prevEl) prevEl.innerHTML = renderQuickPreviewContent(parsed);
    const dupEl = document.getElementById('add-dup-banner');
    if (dupEl) dupEl.innerHTML = renderDupBanner(store, parsed?.name || '');
  } else if (target.name === 'name' && target.closest('#form-add-form')) {
    ui.formName = target.value;
    const dupEl = document.getElementById('add-dup-banner');
    if (dupEl) dupEl.innerHTML = renderDupBanner(store, ui.formName);
  }
}

function patchChromeAndPassiveViews() {
  const badgeSlot = document.getElementById('sync-badge-slot');
  if (badgeSlot) badgeSlot.innerHTML = renderSyncBadge(store);

  const today = todayISO();
  const items = store.state.itemsDoc.items || [];
  const radar = getIdleRadar(items, today);
  const counts = {
    expiring: getExpiringItems(items, today).filter((x) => x.daysLeft <= 30).length,
    idle: radar.unopened.length + radar.idle.length + radar.unverified.length,
    buy: getToBuyItems(items).length,
  };
  for (const [routeId, count] of Object.entries(counts)) {
    const btn = document.querySelector(`.tab-btn[data-route="${routeId}"]`);
    if (!btn) continue;
    let badge = btn.querySelector('.tab-count');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('em');
        badge.className = 'tab-count';
        btn.appendChild(badge);
      }
      badge.textContent = String(count);
    } else if (badge) {
      badge.remove();
    }
  }

  if (ui.route === 'search') {
    const allChip = document.querySelector('.filter-chip[data-filter="all"]');
    if (allChip) allChip.textContent = `全部 (${getActiveItems(items).length})`;
    const resultsEl = document.getElementById('search-results');
    if (resultsEl) resultsEl.innerHTML = renderSearchResults(store, ui);
  }
  if (ui.modal?.kind === 'settings') {
    const statusSlot = document.getElementById('settings-status-slot');
    if (statusSlot) statusSlot.innerHTML = renderSettingsStatus(store);
  }
  if (ui.modal?.kind === 'add') {
    const dupEl = document.getElementById('add-dup-banner');
    if (dupEl) {
      const q = ui.addTab === 'quick' ? (parseQuickText(ui.quickText)?.name || '') : ui.formName;
      dupEl.innerHTML = renderDupBanner(store, q);
    }
  }
}

function parseHash() {
  const h = (location.hash || '#/search').replace(/^#\/?/, '');
  const [seg, arg] = h.split('/');
  if (seg === 'loc' && arg) {
    ui.route = 'map';
    ui.locCode = decodeURIComponent(arg);
  } else if (seg === 'item' && arg) {
    ui.route = 'search';
    ui.locCode = '';
    ui.modal = { kind: 'edit', id: decodeURIComponent(arg) };
  } else if (['search', 'expiring', 'idle', 'buy', 'map'].includes(seg)) {
    ui.route = seg;
    ui.locCode = '';
  } else {
    ui.route = 'search';
    ui.locCode = '';
  }
}

async function runMutation(type, payload, okMsg) {
  const op = await store.dispatch(type, payload);
  if (!op) {
    render();
    toast('当前为只读搜索模式（如需修改请在设置里关闭只读）');
    return false;
  }
  toast(okMsg);
  return true;
}

function render() {
  const root = document.getElementById('app');
  if (!root) return;
  hasRendered = true;
  pendingStoreRender = false;
  imeComposing = false;
  imeTarget = null;
  imeEndedAt = 0;
  imeEndedTarget = null;
  imeEndedEvent = null;
  backdropDown = false;

  const today = todayISO();
  const items = store.state.itemsDoc.items || [];
  const expCount = getExpiringItems(items, today).filter((x) => x.daysLeft <= 30).length;
  const radar = getIdleRadar(items, today);
  const idleCount = radar.unopened.length + radar.idle.length + radar.unverified.length;
  const buyCount = getToBuyItems(items).length;

  let mainHtml = '';
  if (ui.route === 'search') mainHtml = renderSearchView(store, ui);
  else if (ui.route === 'expiring') mainHtml = renderExpiringView(store);
  else if (ui.route === 'idle') mainHtml = renderIdleView(store);
  else if (ui.route === 'buy') mainHtml = renderBuyView(store);
  else if (ui.route === 'map') mainHtml = renderMapView(store, ui.locCode);

  let modalHtml = '';
  if (ui.modal?.kind === 'add' && !store.isReadOnly) modalHtml = renderQuickAddModal(store, ui);
  else if (ui.modal?.kind === 'move' && !store.isReadOnly) modalHtml = renderMoveModal(store, ui.modal.id);
  else if (ui.modal?.kind === 'edit') {
    modalHtml = store.isReadOnly ? renderDetailModal(store, ui.modal.id) : renderEditModal(store, ui.modal.id);
  } else if (ui.modal?.kind === 'settings') modalHtml = renderSettingsModal(store);

  const tabs = [
    { id: 'search', label: '秒搜', count: 0 },
    { id: 'expiring', label: '限期', count: expCount },
    { id: 'idle', label: '吃灰', count: idleCount },
    { id: 'buy', label: '采购', count: buyCount },
    { id: 'map', label: '本子/箱', count: 0 },
  ];

  root.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <img class="brand-mark" src="icons/favicon.svg?v=2" alt="" width="28" height="28">
        <h1>物品库</h1>
      </div>
      <div class="top-right">
        <span id="sync-badge-slot">${renderSyncBadge(store)}</span>
        ${store.isReadOnly ? '' : '<button class="btn-add" data-act="open-add">+ 录入</button>'}
        <button class="icon-btn" data-act="open-settings" aria-label="设置">⚙</button>
      </div>
    </header>
    <main class="main">${mainHtml}</main>
    <nav class="tabbar" aria-label="主导航">
      ${tabs.map((t) => `
        <button class="tab-btn ${ui.route === t.id ? 'active' : ''}" data-act="nav" data-route="${t.id}">
          <span>${t.label}</span>
          ${t.count > 0 ? `<em class="tab-count">${t.count}</em>` : ''}
        </button>`).join('')}
    </nav>
    ${modalHtml}`;
}

function openPrintLabels() {
  const locs = store.state.locsDoc.locations || [];
  const win = window.open('', '_blank');
  if (!win) { toast('请允许浏览器打开打印页'); return; }
  const cards = locs.map((l) => `
    <div style="border:1.5px solid #222;border-radius:8px;padding:10px 12px;break-inside:avoid;">
      <div style="font-size:22px;font-weight:700;letter-spacing:1px;">${esc(l.code)}</div>
      <div style="font-size:12px;color:#444;margin-top:4px;">${esc(l.site)} · ${esc(l.zone)} · ${esc(l.container)}</div>
      <div style="font-size:10px;color:#777;margin-top:4px;word-break:break-all;">#/loc/${esc(l.code)}</div>
    </div>`).join('');
  win.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>容器短码贴纸</title></head>
    <body style="font-family:-apple-system,PingFang SC,Arial,sans-serif;padding:16px;">
      <h2 style="margin:0 0 12px;font-size:16px;">物品库容器短码贴纸（剪下贴在抽屉/箱外）</h2>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">${cards}</div>
      <script>window.print();</script>
    </body></html>`);
  win.document.close();
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  const id = btn.dataset.id;

  if (act === 'nav') {
    location.hash = `#/${btn.dataset.route}`;
  } else if (act === 'set-filter') {
    ui.searchFilter = btn.dataset.filter;
    const resultsEl = document.getElementById('search-results');
    if (ui.route === 'search' && resultsEl) {
      document.querySelectorAll('.filter-chip').forEach((chip) => {
        chip.classList.toggle('active', chip.dataset.filter === ui.searchFilter);
      });
      resultsEl.innerHTML = renderSearchResults(store, ui);
    } else {
      render();
    }
  } else if (act === 'clear-search') {
    ui.searchQuery = '';
    const inputEl = document.getElementById('search-input');
    const resultsEl = document.getElementById('search-results');
    const clearBtn = document.getElementById('search-clear');
    if (inputEl && resultsEl) {
      inputEl.value = '';
      if (clearBtn) clearBtn.hidden = true;
      resultsEl.innerHTML = renderSearchResults(store, ui);
      inputEl.focus();
    } else {
      render();
    }
  } else if (act === 'open-add') {
    if (store.isReadOnly) { toast('当前为只读搜索模式'); return; }
    ui.modal = { kind: 'add' };
    ui.quickText = '';
    ui.formName = '';
    render();
  } else if (act === 'add-tab') {
    if (ui.addTab === btn.dataset.tab) return;
    ui.addTab = btn.dataset.tab;
    render();
  } else if (act === 'open-move') {
    if (store.isReadOnly) { toast('当前为只读搜索模式'); return; }
    ui.modal = { kind: 'move', id };
    render();
  } else if (act === 'do-move') {
    ui.modal = null;
    await runMutation('move_item', { id, location: btn.dataset.loc }, '位置已更新');
  } else if (act === 'return-home') {
    await runMutation('return_home', { id }, '已归位');
  } else if (act === 'dec') {
    await runMutation('qty_delta', { id, delta: -1 }, '数量 -1');
  } else if (act === 'use') {
    await runMutation('mark_used', { id }, '已记录使用');
  } else if (act === 'verify') {
    await runMutation('verify_item', { id }, '位置已核实');
  } else if (act === 'verify-container') {
    await runMutation('verify_container', { code: btn.dataset.code }, `容器 ${btn.dataset.code} 已整格核实`);
  } else if (act === 'toggle-buy') {
    await runMutation('toggle_buy', { id }, '已更新采购清单');
  } else if (act === 'bought') {
    await runMutation('mark_bought', { id, qty: 1 }, '已入库并移出采购清单');
  } else if (act === 'toggle-enotes') {
    await runMutation('toggle_archived_enotes', { id }, '已更新电子化状态');
  } else if (act === 'open-edit') {
    ui.modal = { kind: 'edit', id };
    render();
  } else if (act === 'retire-item') {
    if (store.isReadOnly) { toast('当前为只读搜索模式'); return; }
    if (confirm('确定将此物品归档停用？')) {
      ui.modal = null;
      await runMutation('retire_item', { id }, '已归档停用');
    }
  } else if (act === 'open-loc') {
    location.hash = `#/loc/${encodeURIComponent(btn.dataset.code)}`;
  } else if (act === 'go-map') {
    location.hash = '#/map';
  } else if (act === 'print-labels') {
    openPrintLabels();
  } else if (act === 'open-settings') {
    ui.modal = { kind: 'settings' };
    render();
  } else if (act === 'sync-now') {
    await store.sync();
    if (store.syncState === 'error') {
      toast(`同步失败：${store.lastError || '请点右上角设置检查'}`);
    } else if (store.syncState === 'offline' || store.outbox.length) {
      toast('当前离线，已保存在本地队列');
    } else {
      toast('同步完成');
    }
  } else if (act === 'discard-outbox') {
    if (confirm('放弃本地未同步的修改，并从私有仓拉取最新数据？')) {
      await store.discardOutboxAndSync();
      if (store.syncState !== 'error') {
        ui.modal = null;
        render();
      }
      toast(store.syncState === 'error' ? `拉取失败：${store.lastError}` : '已放弃未同步修改并拉取最新');
    }
  } else if (act === 'switch-readonly') {
    await store.setReadOnly(true);
    ui.modal = null;
    render();
    toast(store.syncState === 'error' ? `已切为只读模式，拉取失败：${store.lastError}` : '已切为只读搜索模式并拉取最新');
  } else if (act === 'export-json') {
    const blob = new Blob([JSON.stringify(store.state.itemsDoc, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `itemvault-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  } else if (act === 'use-demo') {
    await store.switchDemo();
    ui.modal = null;
    render();
    toast('已切换至本地演示模式');
  } else if (act === 'close-backdrop') {
    if (e.target === btn && (backdropDown || e.detail === 0) && !isComposingActive()) {
      ui.modal = null;
      render();
    }
    backdropDown = false;
  } else if (act === 'close-modal') {
    ui.modal = null;
    render();
  }
});

document.addEventListener('pointerdown', (e) => {
  backdropDown = Boolean(e.target?.dataset?.act === 'close-backdrop');
}, true);

document.addEventListener('compositionstart', (e) => {
  imeComposing = true;
  imeTarget = e.target;
  imeEndedAt = 0;
  imeEndedTarget = null;
  imeEndedEvent = null;
}, true);

document.addEventListener('compositionend', (e) => {
  imeComposing = false;
  imeTarget = null;
  imeEndedAt = performance.now();
  imeEndedTarget = e.target;
  imeEndedEvent = null;
  handleLiveInput(e.target);
}, true);

document.addEventListener('keydown', (e) => {
  if (!imeEndedAt) {
    if (imeEndedEvent && imeEndedEvent !== e) imeEndedEvent = null;
    return;
  }
  const same = !imeEndedTarget || e.target === imeEndedTarget;
  if (isWebKit && same && performance.now() - imeEndedAt < 80 && (e.key === 'Enter' || e.key === 'Escape')) {
    imeEndedEvent = e;
  } else {
    imeEndedEvent = null;
  }
  imeEndedAt = 0;
  imeEndedTarget = null;
}, true);

document.addEventListener('focusout', (e) => {
  if (e.target === imeTarget) {
    const prev = imeTarget;
    imeComposing = false;
    imeTarget = null;
    if (prev?.isConnected) handleLiveInput(prev);
  }
  if (pendingStoreRender && !ui.modal) {
    setTimeout(() => {
      if (pendingStoreRender && !ui.modal && !isTypingElement() && !isComposingActive()) {
        render();
      }
    }, 0);
  }
}, true);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target?.tagName === 'INPUT' && e.target.form && !e.isComposing && isImeEvent(e)) {
    e.preventDefault();
  }
});

document.addEventListener('input', (e) => {
  if (e.isComposing || isComposingActive()) return;
  handleLiveInput(e.target);
});

document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.id === 'quick-add-form') {
    const rawText = form.querySelector('#quick-text')?.value ?? ui.quickText;
    ui.quickText = rawText;
    const parsed = parseQuickText(rawText);
    if (!parsed || !parsed.name) { toast('请输入物品信息'); return; }
    ui.modal = null;
    await runMutation('add_item', parsed, `已入库：${parsed.name}`);
  } else if (form.id === 'form-add-form') {
    const fd = new FormData(form);
    const type = fd.get('item_type') || 'durable';
    const payload = {
      name: fd.get('name'),
      desc: fd.get('desc'),
      qty: Number(fd.get('qty') || 1),
      unit: fd.get('unit') || '件',
      unopened_qty: Number(fd.get('unopened_qty') || 0),
      min_qty: Number(fd.get('min_qty') || 0),
      home_location: fd.get('location'),
      current_location: fd.get('location'),
      item_type: type,
      use_by: fd.get('use_by') || null,
      remind_use_on: fd.get('remind_use_on') || null,
      remind_buy_on: fd.get('remind_buy_on') || null,
      need_buy: fd.get('need_buy') === 'on',
      curation: 'raw',
      notebook_meta: type === 'notebook' ? { topics: fd.get('nb_topics') || '' } : null,
    };
    ui.modal = null;
    await runMutation('add_item', payload, `已入库：${payload.name}`);
  } else if (form.id === 'custom-move-form') {
    const fd = new FormData(form);
    const id = form.dataset.id;
    ui.modal = null;
    await runMutation('move_item', { id, location: fd.get('location'), set_home: fd.get('set_home') === 'on' }, '位置已更新');
  } else if (form.id === 'edit-item-form') {
    const fd = new FormData(form);
    const id = form.dataset.id;
    const type = fd.get('item_type');
    const patch = {
      name: fd.get('name'),
      aliases: fd.get('aliases'),
      desc: fd.get('desc'),
      domain: fd.get('domain'),
      category: fd.get('category'),
      qty: Number(fd.get('qty') || 0),
      unit: fd.get('unit'),
      unopened_qty: Number(fd.get('unopened_qty') || 0),
      min_qty: Number(fd.get('min_qty') || 0),
      item_type: type,
      home_location: fd.get('home_location'),
      current_location: fd.get('current_location'),
      use_by: fd.get('use_by') || null,
      remind_use_on: fd.get('remind_use_on') || null,
      remind_buy_on: fd.get('remind_buy_on') || null,
      idle_review_days: Number(fd.get('idle_review_days') || 90),
      buy_note: fd.get('buy_note') || '',
      need_buy: fd.get('need_buy') === 'on',
      notebook_meta: type === 'notebook' ? {
        code: fd.get('nb_code') || '',
        cover: fd.get('nb_cover') || '',
        topics: fd.get('nb_topics') || '',
        contents_summary: fd.get('nb_summary') || '',
        archived_to_enotes: fd.get('nb_archived') === 'on',
      } : null,
    };
    ui.modal = null;
    await runMutation('update_item', { id, patch }, '修改已保存');
  } else if (form.id === 'settings-form') {
    const fd = new FormData(form);
    const readOnly = fd.get('read_only') === 'on';
    try {
      await store.connect({
        owner: fd.get('owner'),
        repo: fd.get('repo'),
        branch: 'main',
        token: fd.get('token'),
        readOnly,
      });
      ui.modal = null;
      render();
      toast(readOnly ? '已连接私有物品仓（只读搜索模式）' : '已连接私有物品仓');
    } catch (err) {
      toast(`连接失败：${err.message}`);
    }
  }
});

window.addEventListener('hashchange', () => { parseHash(); render(); });
window.addEventListener('online', () => { store.sync(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    const prev = imeTarget;
    imeComposing = false;
    imeTarget = null;
    imeEndedAt = 0;
    imeEndedTarget = null;
    imeEndedEvent = null;
    if (prev?.isConnected) handleLiveInput(prev);
  } else if (document.visibilityState === 'visible') {
    store.sync();
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

store.subscribe(() => {
  const modalInDom = Boolean(document.querySelector('.modal-backdrop'));
  if (hasRendered && Boolean(ui.modal) === modalInDom && (ui.modal || isTypingElement() || isComposingActive())) {
    if (ui.modal || ui.route !== 'search') pendingStoreRender = true;
    patchChromeAndPassiveViews();
    return;
  }
  render();
});
parseHash();
store.init();
