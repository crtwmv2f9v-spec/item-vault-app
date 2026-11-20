// Entry point, router, event delegation, and PWA service worker registration.

import { getExpiringItems, getIdleRadar, getToBuyItems, todayISO } from './model.js';
import { parseQuickText } from './parser.js';
import { VaultStore } from './store.js';
import {
  esc,
  renderBuyView,
  renderEditModal,
  renderExpiringView,
  renderIdleView,
  renderMapView,
  renderMoveModal,
  renderQuickAddModal,
  renderSearchView,
  renderSettingsModal,
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

function syncBadge() {
  if (store.mode === 'demo') return '<span class="sync-pill demo">演示模式</span>';
  if (store.syncState === 'syncing') return '<span class="sync-pill syncing">同步中…</span>';
  if (store.outbox.length > 0) return `<button class="sync-pill offline" data-act="sync-now">待同步 ${store.outbox.length}</button>`;
  if (store.syncState === 'offline') return '<button class="sync-pill offline" data-act="sync-now">离线</button>';
  if (store.syncState === 'error') return '<button class="sync-pill err" data-act="open-settings">同步异常</button>';
  return '<button class="sync-pill ok" data-act="sync-now">已同步</button>';
}

function render() {
  const root = document.getElementById('app');
  if (!root) return;
  const activeEl = document.activeElement;
  const keepFocusId = activeEl && ['search-input', 'quick-text'].includes(activeEl.id) ? activeEl.id : null;
  const selStart = keepFocusId ? activeEl.selectionStart : null;
  const selEnd = keepFocusId ? activeEl.selectionEnd : null;

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
  if (ui.modal?.kind === 'add') modalHtml = renderQuickAddModal(store, ui);
  else if (ui.modal?.kind === 'move') modalHtml = renderMoveModal(store, ui.modal.id);
  else if (ui.modal?.kind === 'edit') modalHtml = renderEditModal(store, ui.modal.id);
  else if (ui.modal?.kind === 'settings') modalHtml = renderSettingsModal(store);

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
        ${syncBadge()}
        <button class="btn-add" data-act="open-add">+ 录入</button>
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

  if (keepFocusId) {
    const el = document.getElementById(keepFocusId);
    if (el) {
      el.focus();
      if (selStart !== null && el.setSelectionRange) el.setSelectionRange(selStart, selEnd);
    }
  }
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
    render();
  } else if (act === 'clear-search') {
    ui.searchQuery = '';
    render();
  } else if (act === 'open-add') {
    ui.modal = { kind: 'add' };
    ui.quickText = '';
    ui.formName = '';
    render();
  } else if (act === 'add-tab') {
    ui.addTab = btn.dataset.tab;
    render();
  } else if (act === 'open-move') {
    ui.modal = { kind: 'move', id };
    render();
  } else if (act === 'do-move') {
    ui.modal = null;
    await store.dispatch('move_item', { id, location: btn.dataset.loc });
    toast('位置已更新');
  } else if (act === 'return-home') {
    await store.dispatch('return_home', { id });
    toast('已归位');
  } else if (act === 'dec') {
    await store.dispatch('qty_delta', { id, delta: -1 });
    toast('数量 -1');
  } else if (act === 'use') {
    await store.dispatch('mark_used', { id });
    toast('已记录使用');
  } else if (act === 'verify') {
    await store.dispatch('verify_item', { id });
    toast('位置已核实');
  } else if (act === 'verify-container') {
    await store.dispatch('verify_container', { code: btn.dataset.code });
    toast(`容器 ${btn.dataset.code} 已整格核实`);
  } else if (act === 'toggle-buy') {
    await store.dispatch('toggle_buy', { id });
    toast('已更新采购清单');
  } else if (act === 'bought') {
    await store.dispatch('mark_bought', { id, qty: 1 });
    toast('已入库并移出采购清单');
  } else if (act === 'toggle-enotes') {
    await store.dispatch('toggle_archived_enotes', { id });
    toast('已更新电子化状态');
  } else if (act === 'open-edit') {
    ui.modal = { kind: 'edit', id };
    render();
  } else if (act === 'retire-item') {
    if (confirm('确定将此物品归档停用？')) {
      ui.modal = null;
      await store.dispatch('retire_item', { id });
      toast('已归档停用');
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
    toast(store.outbox.length ? '当前离线，已保存在本地队列' : '同步完成');
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
    toast('已切换至本地演示模式');
  } else if (act === 'close-modal') {
    ui.modal = null;
    render();
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'search-input') {
    ui.searchQuery = e.target.value;
    render();
  } else if (e.target.id === 'quick-text') {
    ui.quickText = e.target.value;
    render();
  } else if (e.target.name === 'name' && e.target.closest('#form-add-form')) {
    ui.formName = e.target.value;
    render();
  }
});

document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.id === 'quick-add-form') {
    const parsed = parseQuickText(ui.quickText);
    if (!parsed || !parsed.name) { toast('请输入物品信息'); return; }
    ui.modal = null;
    await store.dispatch('add_item', parsed);
    toast(`已入库：${parsed.name}`);
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
    await store.dispatch('add_item', payload);
    toast(`已入库：${payload.name}`);
  } else if (form.id === 'custom-move-form') {
    const fd = new FormData(form);
    const id = form.dataset.id;
    ui.modal = null;
    await store.dispatch('move_item', { id, location: fd.get('location'), set_home: fd.get('set_home') === 'on' });
    toast('位置已更新');
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
    await store.dispatch('update_item', { id, patch });
    toast('修改已保存');
  } else if (form.id === 'settings-form') {
    const fd = new FormData(form);
    try {
      await store.connect({
        owner: fd.get('owner'),
        repo: fd.get('repo'),
        branch: 'main',
        token: fd.get('token'),
      });
      ui.modal = null;
      toast('已连接私有物品仓');
    } catch (err) {
      toast(`连接失败：${err.message}`);
    }
  }
});

window.addEventListener('hashchange', () => { parseHash(); render(); });
window.addEventListener('online', () => { store.sync(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') store.sync();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

store.subscribe(() => render());
parseHash();
store.init();
