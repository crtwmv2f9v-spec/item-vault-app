// Pure domain model, scientific 8-domain taxonomy & deterministic reducer for ItemVault.
// Zero DOM dependencies so it can be tested directly in Node.js.

export const VALID_TYPES = ['durable', 'notebook', 'consumable', 'seasonal'];
export const TYPE_LABELS = {
  durable: '耐用常备',
  notebook: '实体本子',
  consumable: '消耗/囤货',
  seasonal: '季节/场景',
};

// Orthogonal MECE 8-domain x subcategory taxonomy tailored for home/office/lab personal inventory.
export const TAXONOMY = [
  {
    key: 'digital',
    name: '数码影音',
    short: '数码',
    desc: '电脑、影音主机、外设与线材',
    subcategories: ['电脑设备', '手机平板', '影音娱乐', '充电线材', '存储外设', '摄影配件'],
  },
  {
    key: 'home',
    name: '居家日用',
    short: '居家',
    desc: '清洁纸品、收纳、厨具与维修工具',
    subcategories: ['清洁纸品', '居家收纳', '厨房器具', '生活家电', '维修工具', '日常杂项'],
  },
  {
    key: 'care',
    name: '个护健康',
    short: '个护',
    desc: '护肤防晒、洗护、眼部与常备药品',
    subcategories: ['护肤防晒', '洗护清洁', '眼部护理', '常备药品', '保健营养', '个人仪容'],
  },
  {
    key: 'food',
    name: '饮食茶咖',
    short: '饮食',
    desc: '咖啡茶饮、零食粮油与便携水杯',
    subcategories: ['咖啡茶饮', '零食坚果', '粮油调味', '冲调饮品', '便携水杯'],
  },
  {
    key: 'apparel',
    name: '穿搭运动',
    short: '穿搭',
    desc: '运动游泳、换季衣物、鞋包与差旅',
    subcategories: ['游泳水上', '运动健身', '换季衣物', '鞋包配饰', '差旅装备'],
  },
  {
    key: 'stationery',
    name: '文具本册',
    short: '本册',
    desc: '实体本子、书籍、文具与证件卡券',
    subcategories: ['专用本子', '手账草稿', '书籍资料', '文件夹册', '书写文具', '证件卡券'],
  },
  {
    key: 'research',
    name: '科研办公',
    short: '科研',
    desc: '实验防护、科研工具与工位办公器具',
    subcategories: ['实验防护', '科研工具', '办公器具', '实验耗材'],
  },
  {
    key: 'other',
    name: '其他备用',
    short: '其他',
    desc: '纪念收藏、礼品与待归类物品',
    subcategories: ['纪念收藏', '礼品备用', '待归类'],
  },
];

export const DOMAIN_NAMES = TAXONOMY.map((d) => d.name);
export const DOMAIN_BY_NAME = Object.fromEntries(TAXONOMY.map((d) => [d.name, d]));
export const DOMAIN_BY_KEY = Object.fromEntries(TAXONOMY.map((d) => [d.key, d]));

export const LEGACY_DOMAIN_MAP = {
  '电子办公': '数码影音',
  '科研个人装备': '科研办公',
  '实体本子': '文具本册',
  '其他': '其他备用',
};

const LEGACY_CATEGORY_MAP = {
  '游戏娱乐': { domain: '数码影音', category: '影音娱乐' },
  '影音设备': { domain: '数码影音', category: '影音娱乐' },
  '防护装备': { domain: '科研办公', category: '实验防护' },
  '游泳装备': { domain: '穿搭运动', category: '游泳水上' },
  '学习笔记': { domain: '文具本册', category: '专用本子' },
  '饮品咖啡': { domain: '饮食茶咖', category: '咖啡茶饮' },
  '护肤洗护': { domain: '个护健康', category: '护肤防晒' },
};

// Ordered keyword rules (specific compound terms precede broader base words so no rule is shadowed).
const CLASSIFY_RULES = [
  // 0. Compound disambiguation rules (must precede broader terms like 电脑 / 咖啡 / 牙刷 / 相机)
  { re: /(电脑支架|散热支架)/i, domain: '科研办公', category: '办公器具', item_type: 'durable', unit: '个' },
  { re: /(电脑包|相机包|书包)/i, domain: '穿搭运动', category: '鞋包配饰', item_type: 'durable', unit: '个' },
  { re: /(咖啡机|磨豆机)/i, domain: '居家日用', category: '生活家电', item_type: 'durable', unit: '台' },
  { re: /(保温杯|水杯|咖啡杯|随行杯|运动水壶|马克杯|茶壶|手冲壶)/i, domain: '饮食茶咖', category: '便携水杯', item_type: 'durable', unit: '个' },
  { re: /(电动牙刷头|牙刷头)/i, domain: '个护健康', category: '洗护清洁', item_type: 'consumable', unit: '支' },
  { re: /(剃须刀|吹风机|卷发棒|电动牙刷|冲牙器|指甲剪|梳子|化妆镜)/i, domain: '个护健康', category: '个人仪容', item_type: 'durable', unit: '件' },
  { re: /(体温计|血压计|药盒)/i, domain: '个护健康', category: '常备药品', item_type: 'durable', unit: '件' },

  // 1. 数码影音 (checked before notebook so "笔记本电脑" is digital, never paper notebook)
  { re: /(macbook|mbp|thinkpad|笔记本电脑|台式机|显示器|一体机|迷你主机|mac\s*mini|电脑|键盘|鼠标|触控板)/i, domain: '数码影音', category: '电脑设备', item_type: 'durable', unit: '台' },
  { re: /(iphone|ipad|手机|平板|kindle|电纸书|电子书|apple\s*watch|智能手表|运动手环)/i, domain: '数码影音', category: '手机平板', item_type: 'durable', unit: '台' },
  { re: /(switch|ps5|xbox|任天堂|游戏机|手柄|卡带|投影仪|当贝|音响|音箱|耳机|airpods|麦克风|电视)/i, domain: '数码影音', category: '影音娱乐', item_type: 'durable', unit: '台' },
  { re: /(充电器|充电头|氮化镓|充电宝|移动电源|数据线|充电线|排插|插线板|转换插头|转接头|扩展坞|电源适配器)/i, domain: '数码影音', category: '充电线材', item_type: 'durable', unit: '个' },
  { re: /(移动硬盘|固态硬盘|ssd|硬盘盒|u盘|优盘|sd卡|tf卡|内存卡|读卡器|路由器|网线)/i, domain: '数码影音', category: '存储外设', item_type: 'durable', unit: '个' },
  { re: /(相机|镜头|三脚架|稳定器|云台|拍立得|相纸|补光灯|滤镜)/i, domain: '数码影音', category: '摄影配件', item_type: 'durable', unit: '件' },

  // 2. 科研办公
  { re: /(护目镜|安全眼镜|防飞溅眼镜|goggles|实验服|白大褂|防毒面具|劳保手套|丁腈手套)/i, domain: '科研办公', category: '实验防护', item_type: 'durable', unit: '件' },
  { re: /(镊子|游标卡尺|卡尺|移液器|移液枪|探针|芯片|样品盒|载玻片|培养皿|离心管|烧杯|万用表|示波器)/i, domain: '科研办公', category: '科研工具', item_type: 'durable', unit: '件' },
  { re: /(试剂|滤膜|注射器|针头|封口膜|称量纸|擦镜纸|导电胶)/i, domain: '科研办公', category: '实验耗材', item_type: 'consumable', unit: '盒' },
  { re: /(订书机|打孔机|美工刀|白板|计算器|印章|标签机)/i, domain: '科研办公', category: '办公器具', item_type: 'durable', unit: '件' },

  // 3. 文具本册
  { re: /(手账|草稿本|日程本|计划本)/i, domain: '文具本册', category: '手账草稿', item_type: 'notebook', unit: '本' },
  { re: /(专用本|错题本|活页本|记事本|笔记本|本子|实验记录本|素描本)/i, domain: '文具本册', category: '专用本子', item_type: 'notebook', unit: '本' },
  { re: /(书立|文件盒)/i, domain: '文具本册', category: '文件夹册', item_type: 'durable', unit: '个' },
  { re: /(文件夹|档案袋|资料夹|风琴包|活页夹)/i, domain: '文具本册', category: '文件夹册', item_type: 'notebook', unit: '本' },
  { re: /(教材|词典|辞典|参考书|小说|绘本|杂志|说明书|手册|书籍)/i, domain: '文具本册', category: '书籍资料', item_type: 'durable', unit: '本' },
  { re: /(钢笔|圆珠笔|中性笔|签字笔|荧光笔|铅笔|橡皮|修正带|墨水|笔芯|便利贴|便签)/i, domain: '文具本册', category: '书写文具', item_type: 'durable', unit: '支' },
  { re: /(护照|身份证|驾照|驾驶证|签证|毕业证|学位证|合同|发票|保修卡|门禁卡|公交卡|礼品卡|购物卡|会员卡|代金券|优惠券|购物券|抵用券|礼品券|体验券|门票)/i, domain: '文具本册', category: '证件卡券', item_type: 'durable', unit: '张' },

  // 4. 饮食茶咖
  { re: /(挂耳|咖啡|茶包|茶叶|绿茶|红茶|乌龙|抹茶|可可粉|奶茶|滤纸)/i, domain: '饮食茶咖', category: '咖啡茶饮', item_type: 'consumable', unit: '包' },
  { re: /(零食|坚果|饼干|巧克力|糖果|麦片|燕麦|能量棒|果干|薯片)/i, domain: '饮食茶咖', category: '零食坚果', item_type: 'consumable', unit: '袋' },
  { re: /(大米|面条|食用油|酱油|香料|调味|蜂蜜|果酱|番茄酱|方便面|意面|罐头|食品)/i, domain: '饮食茶咖', category: '粮油调味', item_type: 'consumable', unit: '件' },
  { re: /(蛋白粉|奶粉|豆浆粉|电解质|冲剂|饮料|矿泉水|气泡水)/i, domain: '饮食茶咖', category: '冲调饮品', item_type: 'consumable', unit: '瓶' },

  // 5. 个护健康
  { re: /(隐形眼镜|美瞳|护理液|滴眼液|眼药水|洗眼液|蒸汽眼罩|眼镜布|防雾喷雾)/i, domain: '个护健康', category: '眼部护理', item_type: 'consumable', unit: '瓶' },
  { re: /(防晒|隔离|面霜|乳液|精华|爽肤水|化妆水|面膜|卸妆|润唇膏|护手霜|身体乳|护肤|眼霜)/i, domain: '个护健康', category: '护肤防晒', item_type: 'consumable', unit: '支' },
  { re: /(洗面奶|洁面|洗发|护发|沐浴|香皂|洗手液|牙膏|牙刷|牙线|漱口水|棉签|化妆棉|卫生巾|湿厕纸)/i, domain: '个护健康', category: '洗护清洁', item_type: 'consumable', unit: '瓶' },
  { re: /(感冒药|退烧药|布洛芬|止痛药|消炎药|肠胃药|过敏药|创可贴|碘伏|酒精棉|棉片|药膏|药水|药片|胶囊|鼻喷|氯雷他定|口罩|药品)/i, domain: '个护健康', category: '常备药品', item_type: 'consumable', unit: '盒' },
  { re: /(维生素|维c|鱼油|益生菌|褪黑素|叶黄素|钙片|辅酶|保健)/i, domain: '个护健康', category: '保健营养', item_type: 'consumable', unit: '瓶' },
  { re: /(香水|止汗露)/i, domain: '个护健康', category: '个人仪容', item_type: 'consumable', unit: '瓶' },

  // 6. 穿搭运动
  { re: /(泳裤|游泳裤|泳装|泳衣|泳镜|泳帽|浮板|速干浴巾)/i, domain: '穿搭运动', category: '游泳水上', item_type: 'seasonal', unit: '件' },
  { re: /(运动鞋|跑鞋|球拍|羽毛球|网球|篮球|瑜伽垫|弹力带|跳绳|护膝|护腕|雪镜|登山杖|哑铃)/i, domain: '穿搭运动', category: '运动健身', item_type: 'seasonal', unit: '件' },
  { re: /(暖宝宝)/i, domain: '穿搭运动', category: '换季衣物', item_type: 'consumable', unit: '包' },
  { re: /(羽绒服|大衣|冲锋衣|毛衣|卫衣|风衣|外套|围巾|手套|帽子|保暖内衣|秋衣|睡衣|袜子|内衣)/i, domain: '穿搭运动', category: '换季衣物', item_type: 'seasonal', unit: '件' },
  { re: /(行李箱|登机箱|洗漱包|眼罩|耳塞|u型枕|颈枕|分装瓶|晾衣绳)/i, domain: '穿搭运动', category: '差旅装备', item_type: 'seasonal', unit: '件' },
  { re: /(背包|双肩包|通勤包|斜挎包|手提包|钱包|皮带|腰带|墨镜|太阳镜|雨伞|晴雨伞|雨衣|皮鞋|拖鞋)/i, domain: '穿搭运动', category: '鞋包配饰', item_type: 'durable', unit: '件' },

  // 7. 居家日用
  { re: /(纸巾|抽纸|卷纸|卫生纸|湿巾|厨房纸|洗衣液|洗衣凝珠|柔顺剂|洗洁精|洁厕|消毒液|除霉|垃圾袋|保鲜膜|保鲜袋|密封袋|抹布|百洁布|粘毛器)/i, domain: '居家日用', category: '清洁纸品', item_type: 'consumable', unit: '包' },
  { re: /(滤芯|滤网)/i, domain: '居家日用', category: '生活家电', item_type: 'consumable', unit: '个' },
  { re: /(吸尘器|加湿器|除湿机|风扇|电暖器|台灯|小夜灯|熨斗|挂烫机|烧水壶|电饭煲|空气炸锅)/i, domain: '居家日用', category: '生活家电', item_type: 'durable', unit: '台' },
  { re: /(平底锅|汤锅|炒锅|菜刀|砧板|案板|饭盒|保鲜盒|削皮刀|开瓶器|厨房秤|电子秤|餐具)/i, domain: '居家日用', category: '厨房器具', item_type: 'durable', unit: '件' },
  { re: /(电池)/i, domain: '居家日用', category: '维修工具', item_type: 'consumable', unit: '节' },
  { re: /(胶水|502|热熔胶|电工胶带|双面胶|胶带|扎带|挂钩|粘钩)/i, domain: '居家日用', category: '维修工具', item_type: 'consumable', unit: '件' },
  { re: /(螺丝刀|内六角|扳手|钳子|卷尺|钉子|手电筒|剪刀|工具箱)/i, domain: '居家日用', category: '维修工具', item_type: 'durable', unit: '把' },
  { re: /(干燥剂|除湿盒|樟脑丸)/i, domain: '居家日用', category: '居家收纳', item_type: 'consumable', unit: '盒' },
  { re: /(收纳箱|收纳盒|储物盒|整理箱|真空压缩袋|压缩袋|衣架|裤架|鞋盒|防尘罩)/i, domain: '居家日用', category: '居家收纳', item_type: 'durable', unit: '个' },
];

export function classifyText(text, explicitType = '') {
  const s = String(text || '').trim();
  for (const rule of CLASSIFY_RULES) {
    if (rule.re.test(s)) {
      const itemType = VALID_TYPES.includes(explicitType) ? explicitType : rule.item_type;
      return {
        domain: rule.domain,
        category: rule.category,
        item_type: itemType,
        unit: rule.unit,
        matched: true,
      };
    }
  }
  if (explicitType === 'notebook') {
    return { domain: '文具本册', category: '专用本子', item_type: 'notebook', unit: '本', matched: false };
  }
  if (explicitType === 'seasonal') {
    return { domain: '穿搭运动', category: '换季衣物', item_type: 'seasonal', unit: '件', matched: false };
  }
  if (explicitType === 'consumable') {
    return { domain: '居家日用', category: '日常杂项', item_type: 'consumable', unit: '件', matched: false };
  }
  return { domain: '其他备用', category: '待归类', item_type: 'durable', unit: '件', matched: false };
}

export function defaultCategoryForDomain(domainName, itemType = '') {
  if (itemType === 'notebook' && domainName === '文具本册') return '专用本子';
  if (domainName === '居家日用') return '日常杂项';
  return '待归类';
}

export function isForeignCanonicalSubcategory(domainName, categoryName) {
  const cat = String(categoryName || '').trim();
  if (!cat) return false;
  if (cat === '未分类' || cat === '待归类') return true;
  const targetSubs = DOMAIN_BY_NAME[domainName]?.subcategories || [];
  if (targetSubs.includes(cat)) return false;
  if (LEGACY_CATEGORY_MAP[cat]) return true;
  return TAXONOMY.some((d) => d.name !== domainName && d.subcategories.includes(cat));
}

export function resolveItemTaxonomy(it) {
  const rawDomain = String(it?.domain || '').trim();
  const rawCat = String(it?.category || '').trim();
  const isGenericCat = !rawCat || rawCat === '未分类' || rawCat === '待归类';
  const text = [it?.name, ...(it?.aliases || []), it?.desc, rawCat, ...(it?.tags || [])].filter(Boolean).join(' ');
  const inferred = classifyText(text, it?.item_type || '');

  // 1. Already using a canonical domain -> preserve user's domain choice, but still migrate legacy categories within it
  if (DOMAIN_BY_NAME[rawDomain]) {
    const meta = DOMAIN_BY_NAME[rawDomain];
    let category = rawCat;
    let legacy = false;
    if (LEGACY_CATEGORY_MAP[rawCat] && LEGACY_CATEGORY_MAP[rawCat].domain === rawDomain) {
      category = LEGACY_CATEGORY_MAP[rawCat].category;
      legacy = true;
    } else if (isGenericCat) {
      category = inferred.matched && inferred.domain === rawDomain
        ? inferred.category
        : defaultCategoryForDomain(rawDomain, it?.item_type || '');
      if (rawCat === '未分类' || (!rawCat && category !== rawCat)) legacy = true;
    }
    return { key: meta.key, domain: meta.name, category, meta, legacy };
  }

  // 2. Legacy category direct mapping (e.g. "游戏娱乐" -> 数码影音/影音娱乐)
  if (LEGACY_CATEGORY_MAP[rawCat]) {
    const mapped = LEGACY_CATEGORY_MAP[rawCat];
    const meta = DOMAIN_BY_NAME[mapped.domain];
    return { key: meta.key, domain: meta.name, category: mapped.category, meta, legacy: true };
  }

  // 3. Direct legacy domain alias (e.g. 电子办公 -> 数码影音, 科研个人装备 -> 科研办公, 实体本子 -> 文具本册)
  if (LEGACY_DOMAIN_MAP[rawDomain]) {
    const targetDomain = LEGACY_DOMAIN_MAP[rawDomain];
    const meta = DOMAIN_BY_NAME[targetDomain];
    let category = rawCat;
    if (isGenericCat) {
      category = inferred.matched && inferred.domain === targetDomain
        ? inferred.category
        : defaultCategoryForDomain(targetDomain, it?.item_type || '');
    }
    return { key: meta.key, domain: meta.name, category, meta, legacy: true };
  }

  // 4. Legacy catch-all "生活" or blank/unknown domain -> infer from item content
  if (inferred.matched) {
    const meta = DOMAIN_BY_NAME[inferred.domain];
    return { key: meta.key, domain: meta.name, category: inferred.category, meta, legacy: Boolean(rawDomain) };
  }
  if (rawDomain === '生活') {
    const meta = DOMAIN_BY_NAME['居家日用'];
    return { key: meta.key, domain: meta.name, category: isGenericCat ? '日常杂项' : rawCat, meta, legacy: true };
  }
  const fallback = DOMAIN_BY_NAME[inferred.domain] || DOMAIN_BY_NAME['其他备用'];
  return {
    key: fallback.key,
    domain: fallback.name,
    category: isGenericCat ? inferred.category : rawCat,
    meta: fallback,
    legacy: Boolean(rawDomain),
  };
}

export function getSubcategoriesForDomain(domainName, items = []) {
  const meta = DOMAIN_BY_NAME[domainName];
  const base = meta ? [...meta.subcategories] : [];
  for (const it of getActiveItems(items)) {
    const tax = resolveItemTaxonomy(it);
    if (tax.domain === domainName && tax.category && !base.includes(tax.category)) {
      base.push(tax.category);
    }
  }
  return base;
}

export function getDomainStats(items = []) {
  const active = getActiveItems(items);
  const byName = new Map(
    TAXONOMY.map((d) => [d.name, { ...d, count: 0, items: [], subCounts: new Map() }]),
  );
  for (const it of active) {
    const tax = resolveItemTaxonomy(it);
    const bucket = byName.get(tax.domain) || byName.get('其他备用');
    bucket.count += 1;
    bucket.items.push(it);
    bucket.subCounts.set(tax.category, (bucket.subCounts.get(tax.category) || 0) + 1);
  }
  return TAXONOMY.map((d) => {
    const b = byName.get(d.name);
    const topSubs = [...b.subCounts.entries()]
      .sort((a, b2) => b2[1] - a[1])
      .map(([name, count]) => ({ name, count }));
    return { ...d, count: b.count, items: b.items, topSubs };
  });
}

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
  const tax = resolveItemTaxonomy(it);
  return [
    it.id, it.name, ...(it.aliases || []), it.desc, it.domain, it.category,
    tax.domain, tax.category,
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
    if (!reason && category && ((it.unopened_qty || 0) > 0 || it.status === 'unused')) {
      const itCat = it.category || '';
      const resolvedCat = resolveItemTaxonomy(it).category;
      if (itCat === category || resolvedCat === category) {
        reason = `同分类(${category})已有未使用/未拆封囤货`;
      }
    }
    if (reason) out.push({ reason, item: it });
  }
  return out;
}

export function buildRecord(raw, items, locsDoc, today = todayISO()) {
  const name = String(raw.name || '').trim();
  const desc = String(raw.desc || '').trim();
  const aliases = splitList(raw.aliases);
  const inferred = classifyText(`${name} ${desc} ${aliases.join(' ')}`, raw.item_type || '');
  const itemType = VALID_TYPES.includes(raw.item_type) ? raw.item_type : inferred.item_type;
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
  const explicitDomain = String(raw.domain || '').trim();
  const explicitCat = String(raw.category || '').trim();
  const domain = explicitDomain || (itemType === 'notebook' ? '文具本册' : inferred.domain);
  let category;
  if (explicitCat && explicitCat !== '未分类') {
    category = explicitCat;
  } else if (inferred.matched && inferred.domain === domain) {
    category = inferred.category;
  } else {
    category = defaultCategoryForDomain(domain, itemType);
  }
  const explicitUnit = String(raw.unit || '').trim();
  const unit = explicitUnit || (
    itemType === 'notebook'
      ? '本'
      : (inferred.matched && inferred.domain === domain ? (inferred.unit || '件') : '件')
  );

  return {
    id: raw.id || nextItemId(items),
    name,
    aliases,
    desc,
    domain,
    category,
    item_type: itemType,
    tags: splitList(raw.tags),
    qty,
    unit,
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
      if (patch.item_type && VALID_TYPES.includes(patch.item_type)) it.item_type = patch.item_type;
      if (patch.category !== undefined) {
        const nextCat = String(patch.category).trim();
        if (nextCat && nextCat !== '未分类') {
          it.category = nextCat;
        } else {
          const text = [it.name, ...(it.aliases || []), it.desc, ...(it.tags || [])].filter(Boolean).join(' ');
          const inf = classifyText(text, it.item_type || '');
          it.category = inf.matched && inf.domain === it.domain
            ? inf.category
            : defaultCategoryForDomain(it.domain, it.item_type || '');
        }
      }
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
