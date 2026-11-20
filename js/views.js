// UI views & modals for ItemVault PWA.

import {
  TYPE_LABELS,
  extractCode,
  findDuplicates,
  getActiveItems,
  getContainerGroups,
  getExpiringItems,
  getIdleRadar,
  getNotebooks,
  getToBuyItems,
  matchScore,
  todayISO,
} from './model.js';
import { parseQuickText } from './parser.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

function badgesFor(it, today) {
  const out = [];
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
  const away = it.home_location && it.current_location && it.home_location !== it.current_location;
  const loc = it.current_location || it.home_location || '未填位置';
  const qtyText = `${it.qty ?? 0}${it.unit || '件'}`;
  const nb = it.notebook_meta;
  const nbLine = nb
    ? `<div class="card-nb">${esc(nb.cover || '实体本子')}${nb.topics?.length ? ` · ${esc(nb.topics.join('、'))}` : ''} · <strong>${nb.archived_to_enotes ? '已归档 e-notes' : '未电子化'}</strong></div>`
    : '';
  const extraLine = opts.extraNote ? `<div class="card-extra">${esc(opts.extraNote)}</div>` : '';

  return `
    <article class="card" data-id="${esc(it.id)}">
      <div class="card-head">
        <div class="card-title-row">
          <button class="card-title" data-act="open-edit" data-id="${esc(it.id)}">${esc(it.name)}</button>
          <span class="qty-pill">${esc(qtyText)}</span>
        </div>
        <div class="badges">${badgesFor(it, today)}</div>
      </div>
      <div class="card-loc">
        <span class="loc-dot"></span>
        <span>${esc(loc)}</span>
        ${away ? `<span class="home-hint">（常驻：${esc(extractCode(it.home_location) || it.home_location)}）</span>` : ''}
      </div>
      ${it.desc ? `<div class="card-desc">${esc(it.desc)}</div>` : ''}
      ${nbLine}
      ${extraLine}
      <div class="card-actions">
        <button class="btn-chip" data-act="open-move" data-id="${esc(it.id)}">换位置</button>
        ${away ? `<button class="btn-chip btn-accent" data-act="return-home" data-id="${esc(it.id)}">归位</button>` : ''}
        ${(it.item_type === 'consumable' || (it.qty || 0) > 1) ? `<button class="btn-chip" data-act="dec" data-id="${esc(it.id)}">-1</button>` : ''}
        <button class="btn-chip" data-act="use" data-id="${esc(it.id)}">刚用过</button>
        ${opts.showBought
          ? `<button class="btn-chip btn-accent" data-act="bought" data-id="${esc(it.id)}">已买到入库</button>`
          : `<button class="btn-chip ${it.need_buy ? 'btn-active' : ''}" data-act="toggle-buy" data-id="${esc(it.id)}">${it.need_buy ? '取消待买' : '加采购'}</button>`}
        ${nb ? `<button class="btn-chip" data-act="toggle-enotes" data-id="${esc(it.id)}">${nb.archived_to_enotes ? '标未归档' : '已归档e-notes'}</button>` : ''}
        ${opts.showVerify ? `<button class="btn-chip btn-accent" data-act="verify" data-id="${esc(it.id)}">核实位置</button>` : ''}
      </div>
    </article>`;
}

export function renderSearchView(store, ui) {
  const today = todayISO();
  const active = getActiveItems(store.state.itemsDoc.items);
  const filters = [
    { id: 'all', label: `全部 (${active.length})` },
    { id: 'home', label: '家' },
    { id: 'office', label: '办公室' },
    { id: 'lab', label: '实验室' },
    { id: 'notebook', label: '本子' },
    { id: 'away', label: '带出未归位' },
    { id: 'raw', label: '待整理' },
  ];
  const q = ui.searchQuery || '';
  const f = ui.searchFilter || 'all';
  const filtered = active
    .filter((it) => {
      const loc = `${it.current_location || ''} ${it.home_location || ''}`;
      if (f === 'home') return loc.includes('家');
      if (f === 'office') return loc.includes('办公室') || loc.includes('工位');
      if (f === 'lab') return loc.includes('实验室');
      if (f === 'notebook') return it.item_type === 'notebook';
      if (f === 'away') return it.home_location && it.current_location && it.home_location !== it.current_location;
      if (f === 'raw') return it.curation === 'raw';
      return true;
    })
    .map((it) => ({ it, sc: matchScore(it, q) }))
    .filter((x) => x.sc > 0)
    .sort((a, b) => (b.sc - a.sc) || a.it.id.localeCompare(b.it.id));

  return `
    <section class="panel">
      <div class="search-box">
        <input id="search-input" type="search" placeholder="搜名称 / 别名 / 地点 / 容器码 / 本子主题…" value="${esc(q)}" autocomplete="off" />
        ${q ? '<button class="clear-btn" data-act="clear-search" aria-label="清空">✕</button>' : ''}
      </div>
      <div class="chip-row">
        ${filters.map((x) => `<button class="filter-chip ${f === x.id ? 'active' : ''}" data-act="set-filter" data-filter="${x.id}">${esc(x.label)}</button>`).join('')}
      </div>
      ${filtered.length
        ? `<div class="card-list">${filtered.map(({ it }) => renderItemCard(it, today)).join('')}</div>`
        : `<div class="empty-box">
             <p>${active.length ? `没有找到匹配「${esc(q)}」的物品` : '物品库还是空的'}</p>
             <button class="btn-primary" data-act="open-add">+ 录入第一件物品</button>
           </div>`}
    </section>`;
}

export function renderExpiringView(store) {
  const today = todayISO();
  const list = getExpiringItems(store.state.itemsDoc.items, today);
  return `
    <section class="panel">
      <div class="sec-head">
        <h2>限期用完队列</h2>
        <span class="muted">按目标期限倒计时排序（自动同步至 iCloud 日历「物品提醒」）</span>
      </div>
      ${list.length
        ? `<div class="card-list">${list.map(({ item, daysLeft }) => {
            const note = daysLeft < 0 ? `已超出目标日期 ${-daysLeft} 天（${item.use_by}）`
              : (daysLeft === 0 ? `今天是目标期限（${item.use_by}）` : `距离目标期限 ${item.use_by} 还有 ${daysLeft} 天`);
            return renderItemCard(item, today, { extraNote: note });
          }).join('')}</div>`
        : '<div class="empty-box"><p>暂无设置限期用完（use_by）的物品。</p></div>'}
    </section>`;
}

export function renderIdleView(store) {
  const today = todayISO();
  const { unopened, idle, unverified } = getIdleRadar(store.state.itemsDoc.items, today);
  return `
    <section class="panel">
      <div class="sec-head">
        <h2>吃灰与防买重雷达</h2>
        <span class="muted">网购下单前扫一眼，避免重复囤货</span>
      </div>
      <h3 class="subhead">未拆封 / 未使用囤货（${unopened.length}）</h3>
      ${unopened.length
        ? `<div class="card-list">${unopened.map((it) => renderItemCard(it, today, { extraNote: `未拆封 ${it.unopened_qty || it.qty}${it.unit || '件'}，优先消耗` })).join('')}</div>`
        : '<p class="muted-empty">暂无未拆封囤货。</p>'}

      <h3 class="subhead">超期吃灰（${idle.length}）</h3>
      ${idle.length
        ? `<div class="card-list">${idle.map(({ item, idleDays }) => renderItemCard(item, today, { extraNote: `已 ${idleDays} 天未记录使用` })).join('')}</div>`
        : '<p class="muted-empty">暂无超期吃灰物品。</p>'}

      <h3 class="subhead">超 180 天未核实位置（${unverified.length}）</h3>
      ${unverified.length
        ? `<div class="card-list">${unverified.map(({ item, days }) => renderItemCard(item, today, { extraNote: `上次核实位置已过去 ${days} 天`, showVerify: true })).join('')}</div>`
        : '<p class="muted-empty">所有物品位置均在 180 天内核实过。</p>'}
    </section>`;
}

export function renderBuyView(store) {
  const today = todayISO();
  const list = getToBuyItems(store.state.itemsDoc.items);
  return `
    <section class="panel">
      <div class="sec-head">
        <h2>采购与补货清单（${list.length}）</h2>
        <span class="muted">指定日期按当日提醒，未指定日期自动汇总到每周日 iCloud 日历「物品提醒」</span>
      </div>
      ${list.length
        ? `<div class="card-list">${list.map((it) => {
            const parts = [];
            if (it.remind_buy_on) parts.push(`提醒购买日：${it.remind_buy_on}`);
            if (it.buy_note) parts.push(`备注：${it.buy_note}`);
            if ((it.unopened_qty || 0) > 0) parts.push(`注意：库中还有 ${it.unopened_qty} 件未拆封`);
            return renderItemCard(it, today, { extraNote: parts.join(' | '), showBought: true });
          }).join('')}</div>`
        : '<div class="empty-box"><p>当前没有待采购或低库存物品。</p></div>'}
    </section>`;
}

export function renderMapView(store, locCode = '') {
  const today = todayISO();
  const items = store.state.itemsDoc.items;
  const groups = getContainerGroups(items, store.state.locsDoc.locations);

  if (locCode) {
    const code = locCode.toUpperCase();
    const grp = groups.find((g) => String(g.code).toUpperCase() === code);
    const matched = grp ? grp.items : [];
    return `
      <section class="panel">
        <div class="loc-detail-head">
          <button class="btn-chip" data-act="go-map">← 返回容器地图</button>
          <button class="btn-chip btn-accent" data-act="verify-container" data-code="${esc(code)}">整格核实 (${matched.length}件)</button>
        </div>
        <h2 class="loc-detail-title">[${esc(code)}] ${esc(grp?.label || code)}</h2>
        ${matched.length
          ? `<div class="card-list">${matched.map((it) => renderItemCard(it, today)).join('')}</div>`
          : '<div class="empty-box"><p>该容器内当前没有物品。</p></div>'}
      </section>`;
  }

  const nbs = getNotebooks(items);
  return `
    <section class="panel">
      <div class="sec-head">
        <h2>实体本子墙（${nbs.length}）</h2>
        <span class="muted">记录书脊号、封面、主题与电子化归档状态</span>
      </div>
      ${nbs.length
        ? `<div class="card-list">${nbs.map((it) => renderItemCard(it, today)).join('')}</div>`
        : '<p class="muted-empty">暂无录入的实体本子。</p>'}

      <div class="sec-head" style="margin-top:20px;">
        <h2>容器地图（${groups.length}）</h2>
        <button class="btn-chip" data-act="print-labels">打印容器短码贴纸</button>
      </div>
      <div class="loc-grid">
        ${groups.map((g) => `
          <button class="loc-tile" data-act="open-loc" data-code="${esc(g.code)}">
            <div class="loc-tile-top">
              <span class="code-pill">${esc(g.code)}</span>
              <span class="muted">${g.items.length} 件</span>
            </div>
            <div class="loc-tile-name">${esc(g.site)} · ${esc(g.zone)}</div>
            <div class="loc-tile-sub">${esc(g.container)}</div>
          </button>`).join('')}
      </div>
    </section>`;
}

// ---------- Modals ----------

export function renderQuickAddModal(store, state) {
  const tab = state.addTab || 'quick';
  const rawText = state.quickText || '';
  const parsed = tab === 'quick' ? parseQuickText(rawText) : null;
  const dupQuery = tab === 'quick' ? (parsed?.name || '') : (state.formName || '');
  const dups = dupQuery.length >= 2 ? findDuplicates(store.state.itemsDoc.items, dupQuery) : [];
  const locs = store.state.locsDoc.locations || [];

  const dupBanner = dups.length
    ? `<div class="dup-alert">
         <strong>防买重 / 重复提醒：</strong>
         ${dups.slice(0, 3).map((d) => `<div>· [${esc(d.reason)}] ${esc(d.item.name)}（${esc(d.item.qty)}${esc(d.item.unit)}）@ ${esc(d.item.current_location)}</div>`).join('')}
       </div>`
    : '';

  return `
    <div class="modal-backdrop" data-act="close-modal">
      <div class="modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
        <div class="modal-head">
          <h3>极简录入</h3>
          <button class="icon-btn" data-act="close-modal">✕</button>
        </div>
        <div class="seg-tabs">
          <button class="${tab === 'quick' ? 'active' : ''}" data-act="add-tab" data-tab="quick">一句话速录</button>
          <button class="${tab === 'form' ? 'active' : ''}" data-act="add-tab" data-tab="form">4 格表单</button>
        </div>
        ${dupBanner}
        ${tab === 'quick' ? `
          <form id="quick-add-form" class="form-stack">
            <textarea id="quick-text" rows="3" placeholder="例：化学护目镜 1副 放实验室个人抽屉 可套近视镜&#10;例：挂耳咖啡 2袋 家厨房柜 12月15日前用完 1袋未拆">${esc(rawText)}</textarea>
            <div id="quick-preview" class="preview-box">
              ${parsed ? `
                <span>名称：<b>${esc(parsed.name)}</b></span>
                <span>数量：<b>${esc(parsed.qty)}${esc(parsed.unit)}</b></span>
                <span>地点：<b>${esc(parsed.current_location)}</b></span>
                <span>类型：<b>${esc(TYPE_LABELS[parsed.item_type])}</b></span>
                ${parsed.unopened_qty ? `<span>未拆：<b>${esc(parsed.unopened_qty)}</b></span>` : ''}
                ${parsed.use_by ? `<span>限期：<b>${esc(parsed.use_by)}</b></span>` : ''}
                ${parsed.remind_use_on ? `<span>提醒用：<b>${esc(parsed.remind_use_on)}</b></span>` : ''}
                ${parsed.need_buy ? `<span><b>待买${parsed.remind_buy_on ? ` (${esc(parsed.remind_buy_on)})` : ''}</b></span>` : ''}
              ` : '<span class="muted">输入物品、数量、存放地点即可，本地即时可搜。</span>'}
            </div>
            <div class="modal-foot">
              <button type="button" class="btn-chip" data-act="close-modal">取消</button>
              <button type="submit" class="btn-primary">立即入库</button>
            </div>
          </form>
        ` : `
          <form id="form-add-form" class="form-stack">
            <label>物品名称 *<input name="name" required value="${esc(state.formName || '')}" placeholder="如：化学护目镜 / 泳裤 / 驾考错题本" /></label>
            <label>描述<input name="desc" placeholder="颜色、型号、特点或备注" /></label>
            <div class="row-2">
              <label>数量<input name="qty" type="number" step="any" min="0" value="1" /></label>
              <label>单位<input name="unit" placeholder="件/副/本/瓶" value="件" /></label>
            </div>
            <label>储存地点 *
              <input name="location" list="loc-datalist" placeholder="如：家 > 衣柜 > 运动抽屉 或 办公室铁柜" required />
              <datalist id="loc-datalist">${locs.map((l) => `<option value="${esc(l.label)}"></option>`).join('')}</datalist>
            </label>
            <details class="adv-box">
              <summary>更多选项（类型 / 限期 / 未拆封 / 提醒 / 实体本子）</summary>
              <div class="form-stack" style="margin-top:10px;">
                <div class="row-2">
                  <label>类型
                    <select name="item_type">
                      <option value="durable">耐用常备</option>
                      <option value="notebook">实体本子</option>
                      <option value="consumable">消耗/囤货</option>
                      <option value="seasonal">季节/场景</option>
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
    <div class="modal-backdrop" data-act="close-modal">
      <div class="modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
        <div class="modal-head">
          <h3>移位：${esc(it.name)}</h3>
          <button class="icon-btn" data-act="close-modal">✕</button>
        </div>
        <p class="muted" style="margin:0 0 10px;">当前：${esc(it.current_location)}</p>
        <div class="spot-list">
          ${spots.slice(0, 10).map((sp) => `
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
  return `
    <div class="modal-backdrop" data-act="close-modal">
      <div class="modal modal-tall" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
        <div class="modal-head">
          <h3>编辑 ${esc(it.id)}</h3>
          <button class="icon-btn" data-act="close-modal">✕</button>
        </div>
        <form id="edit-item-form" class="form-stack" data-id="${esc(it.id)}">
          <label>名称<input name="name" value="${esc(it.name)}" required /></label>
          <label>别名/同义词（逗号分隔）<input name="aliases" value="${esc((it.aliases || []).join(', '))}" /></label>
          <label>描述<input name="desc" value="${esc(it.desc || '')}" /></label>
          <div class="row-2">
            <label>领域<input name="domain" value="${esc(it.domain || '')}" /></label>
            <label>分类<input name="category" value="${esc(it.category || '')}" /></label>
          </div>
          <div class="row-3">
            <label>数量<input name="qty" type="number" step="any" min="0" value="${esc(it.qty ?? 1)}" /></label>
            <label>单位<input name="unit" value="${esc(it.unit || '件')}" /></label>
            <label>未拆封<input name="unopened_qty" type="number" min="0" value="${esc(it.unopened_qty ?? 0)}" /></label>
          </div>
          <div class="row-2">
            <label>类型
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
          ${it.item_type === 'notebook' ? `
            <div class="nb-section">
              <div class="row-2">
                <label>本子编号<input name="nb_code" value="${esc(nb.code || '')}" /></label>
                <label>封面特征<input name="nb_cover" value="${esc(nb.cover || '')}" /></label>
              </div>
              <label>主题标签（逗号分隔）<input name="nb_topics" value="${esc((nb.topics || []).join(', '))}" /></label>
              <label>内容摘要<input name="nb_summary" value="${esc(nb.contents_summary || '')}" /></label>
              <label class="chk-row"><input type="checkbox" name="nb_archived" ${nb.archived_to_enotes ? 'checked' : ''} /> 已归档至 e-notes</label>
            </div>` : ''}
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

export function renderSettingsModal(store) {
  const cfg = store.config || { owner: 'crtwmv2f9v-spec', repo: 'item-vault-data', branch: 'main', token: '' };
  return `
    <div class="modal-backdrop" data-act="close-modal">
      <div class="modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
        <div class="modal-head">
          <h3>同步与仓库设置</h3>
          <button class="icon-btn" data-act="close-modal">✕</button>
        </div>
        <div class="status-box">
          <div>模式：<b>${store.mode === 'github' ? '私有 GitHub 仓库' : '本地演示模式'}</b></div>
          <div>离线队列：<b>${store.outbox.length} 条待同步</b></div>
          ${store.lastSyncedAt ? `<div>上次同步：${esc(store.lastSyncedAt.replace('T', ' ').slice(0, 19))}</div>` : ''}
          ${store.lastError ? `<div class="err-line">${esc(store.lastError)}</div>` : ''}
        </div>
        <form id="settings-form" class="form-stack">
          <div class="row-2">
            <label>GitHub 用户名<input name="owner" value="${esc(cfg.owner)}" required /></label>
            <label>私有数据仓名<input name="repo" value="${esc(cfg.repo)}" required /></label>
          </div>
          <label>Fine-grained Token（仅授权该私有仓 Contents：只搜选 Read-only，需手机端修改选 Read &amp; Write）
            <input name="token" type="password" value="${esc(cfg.token || '')}" placeholder="github_pat_..." required />
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
