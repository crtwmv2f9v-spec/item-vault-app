// Lightweight Chinese natural-language parser for 1-line quick item capture.
// Runs locally on phone/desktop with zero external API latency.

import { classifyText, todayISO } from './model.js';

function resolveDateToken(str, now = new Date()) {
  const y = now.getFullYear();
  let m = str.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  m = str.match(/(\d{1,2})月(\d{1,2})[日号]?/);
  if (m) {
    const mo = parseInt(m[1], 10);
    const da = parseInt(m[2], 10);
    const yr = (mo < now.getMonth() + 1) ? y + 1 : y;
    return `${yr}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
  }
  m = str.match(/(\d{1,2})月底/);
  if (m) {
    const mo = parseInt(m[1], 10);
    const yr = (mo < now.getMonth() + 1) ? y + 1 : y;
    const lastDay = new Date(yr, mo, 0).getDate();
    return `${yr}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }
  m = str.match(/(\d{1,2})月/);
  if (m) {
    const mo = parseInt(m[1], 10);
    const yr = (mo < now.getMonth() + 1) ? y + 1 : y;
    return `${yr}-${String(mo).padStart(2, '0')}-01`;
  }
  return null;
}

export function inferTypeAndDomain(text) {
  const res = classifyText(text);
  return {
    item_type: res.item_type,
    domain: res.domain,
    category: res.category,
    unit: res.unit,
  };
}

function normalizeInlineLocation(rawLoc) {
  let s = String(rawLoc || '').replace(/^(放在?|存在?|位于|在)/, '').trim();
  if (!s) return '';
  if (/[>/＞→\[]/.test(s)) return s;
  const siteM = s.match(/^(家里|家|宿舍|办公室|工位|实验室|随身包|随身)(.*)$/);
  if (siteM) {
    const site = siteM[1] === '家里' ? '家' : (siteM[1] === '随身包' ? '随身' : siteM[1]);
    const rest = siteM[2].trim();
    if (!rest) return site;
    return `${site} > ${rest}`;
  }
  return s;
}

export function parseQuickText(input, now = new Date()) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  let text = raw;
  let qty = 1;
  let unit = '';
  let unopenedQty = 0;
  let useBy = null;
  let remindUseOn = null;
  let remindBuyOn = null;
  let needBuy = false;
  let location = '';

  // 1. Extract explicit dates with intent
  const useByM = text.match(/((?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2})|(?:\d{1,2}月(?:\d{1,2}[日号]?|底)?))\s*(?:之前用完|前用完|前用掉|前用|过期|到期|截止)/);
  if (useByM) {
    useBy = resolveDateToken(useByM[1], now);
    text = text.replace(useByM[0], ' ');
  }

  const buyDateM = text.match(/(?:提醒买|提醒购买|买前提醒)\s*((?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2})|(?:\d{1,2}月\d{1,2}[日号]?))/);
  if (buyDateM) {
    remindBuyOn = resolveDateToken(buyDateM[1], now);
    needBuy = true;
    text = text.replace(buyDateM[0], ' ');
  }

  const useDateM = text.match(/(?:提醒用|提醒使用|提醒带)\s*((?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2})|(?:\d{1,2}月\d{1,2}[日号]?))/);
  if (useDateM) {
    remindUseOn = resolveDateToken(useDateM[1], now);
    text = text.replace(useDateM[0], ' ');
  }

  if (/(?:要买|待买|补货|需要买|买一个|买点)/.test(text)) {
    needBuy = true;
    text = text.replace(/(?:要买|待买|需补货|补货|需要买)/g, ' ');
  }

  // 2. Unopened count (e.g. "2瓶未拆", "未拆封1盒")
  const unopM = text.match(/(\d+)\s*(?:个|件|副|条|本|瓶|盒|袋|包|支|罐|桶|张|套|双|把|节)?\s*(?:未拆封|未拆|全新|没拆)/)
    || text.match(/(?:未拆封|未拆|全新|没拆)\s*(\d+)/);
  if (unopM) {
    unopenedQty = parseInt(unopM[1], 10) || 0;
    text = text.replace(unopM[0], ' ');
  } else if (/(?:未拆封|未拆|没用过|全新未拆)/.test(text)) {
    unopenedQty = -1; // sentinel: equals qty
    text = text.replace(/(?:全新未拆|未拆封|未拆|没用过)/g, ' ');
  }

  // 3. Location phrase (e.g. "放实验室个人抽屉", "在家>衣柜>抽屉", "办公室书架", "[O-C2]")
  const codeM = text.match(/\[([A-Za-z]{1,2}-[A-Za-z0-9]{1,6})\]/);
  const locM = text.match(/(?:放在?|存在?|位于|在)\s*([^\s,，;；]+)/)
    || text.match(/((?:家里|家|宿舍|办公室|工位|实验室|随身包|随身)(?:\s*[>/＞→]\s*[^\s,，;；]+|[^\s,，;；]+))/);
  if (locM) {
    location = normalizeInlineLocation(locM[1]);
    text = text.replace(locM[0], ' ');
  } else if (codeM) {
    location = codeM[1].toUpperCase();
    text = text.replace(codeM[0], ' ');
  }

  // 4. Quantity + unit (e.g. "2瓶", "1副", "4节", "x3")
  const qtyM = text.match(/(?:数量[:：]?\s*|x|×|\*)?(\d+(?:\.\d+)?)\s*(副|条|本|瓶|盒|袋|包|支|罐|桶|张|套|双|把|台|块|节|件|个)/)
    || text.match(/(?:x|×|\*)\s*(\d+(?:\.\d+)?)\b/);
  if (qtyM) {
    qty = Number(qtyM[1]) || 1;
    unit = qtyM[2] || '';
    text = text.replace(qtyM[0], ' ');
  }

  // 5. Split remaining tokens into name + desc
  const pieces = text.split(/[,，;；\s]+/).map((x) => x.trim()).filter(Boolean);
  const name = pieces[0] || raw.slice(0, 20);
  const desc = pieces.slice(1).join(' ');

  const inferred = inferTypeAndDomain(`${name} ${desc}`);
  if (!unit) unit = inferred.unit;
  if (unopenedQty === -1) unopenedQty = qty;
  if (unopenedQty > qty) qty = unopenedQty;

  return {
    name,
    desc,
    qty,
    unit,
    unopened_qty: unopenedQty,
    home_location: location || '家 > 未分格 > 默认 [H-00]',
    current_location: location || '家 > 未分格 > 默认 [H-00]',
    item_type: inferred.item_type,
    domain: inferred.domain,
    category: inferred.category,
    use_by: useBy,
    remind_use_on: remindUseOn,
    need_buy: needBuy,
    remind_buy_on: remindBuyOn,
    curation: 'raw',
    added_at: todayISO(now),
  };
}
