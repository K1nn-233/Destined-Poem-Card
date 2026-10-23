// 状态栏主题预览的示例界面（来自已删除的 theme-studio 小工具），只用于工作台预览。
const svg = p => '<svg viewBox="0 0 24 24"><path d="' + p + '"/></svg>';
const ICONS = {
  clock: svg('M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm.5-13H11v6l5.2 3.1.8-1.2-4.3-2.6V7z'),
  location: svg('M12 2C8.1 2 5 5.1 5 8.5c0 5.2 7 13 7 13s7-7.8 7-13C19 5.1 15.9 2 12 2zm0 9.5c-1.4 0-2.5-1.1-2.5-2.5S10.6 6.5 12 6.5s2.5 1.1 2.5 2.5S13.4 11.5 12 11.5z'),
  refresh: svg('M17.6 6.4A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.8-4.2L13 11h7V4l-2.4 2.4z'),
  gear: svg('M19.1 12.9c0-.3.1-.6.1-.9s0-.6-.1-.9l2-1.6c.2-.1.3-.4.1-.6l-1.9-3.3c-.1-.2-.4-.3-.6-.2l-2.4 1c-.5-.4-1-.7-1.6-.9l-.4-2.5c0-.3-.2-.4-.5-.4h-3.8c-.2 0-.4.2-.5.4l-.4 2.5c-.6.2-1.1.5-1.6.9l-2.4-1c-.2-.1-.5 0-.6.2l-1.9 3.3c-.1.2 0 .5.1.6l2 1.6c-.1.3-.1.6-.1.9s0 .6.1.9l-2 1.6c-.2.1-.3.4-.1.6l1.9 3.3c.1.2.4.3.6.2l2.4-1c.5.4 1 .7 1.6.9l.4 2.5c.1.2.3.4.5.4h3.8c.2 0 .4-.2.5-.4l.4-2.5c.6-.2 1.1-.5 1.6-.9l2.4 1c.2.1.5 0 .6-.2l1.9-3.3c.1-.2 0-.5-.1-.6l-2-1.6zm-7.1 2.7c-2 0-3.6-1.6-3.6-3.6s1.6-3.6 3.6-3.6 3.6 1.6 3.6 3.6-1.6 3.6-3.6 3.6z'),
  scroll: svg('M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z'),
  user: svg('M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z'),
  briefcase: svg('M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 0h-4V4h4v2z'),
  star: svg('M12 17.3 18.2 21l-1.6-7 5.4-4.7-7.2-.6L12 2 9.2 8.7 2 9.3l5.4 4.7L5.8 21z'),
  newspaper: svg('M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4 14H6v-2h9v2zm3-4H6v-2h12v2zm0-4H6V7h12v2z'),
  map: svg('M20.5 3 20 3.1 15 5.1 9 3 3.4 4.9c-.2.1-.4.3-.4.5v15.1c0 .3.2.5.5.5l.5-.1 5-2 6 2 5.6-1.9c.2-.1.4-.3.4-.5V3.5c0-.3-.2-.5-.5-.5zM15 19l-6-2.1V5l6 2.1V19z'),
  coin: svg('M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm.3-4.4v-1.6c-1-.1-2.1-.5-2.9-1.3l.9-1.2c.9.9 2 1.3 3 1.3.9 0 1.6-.4 1.6-1.2 0-.9-1.1-1.1-2.4-1.3-1.5-.3-3-.8-3-2.5 0-1.3.9-2.2 2.5-2.5V6.9c.5.1 1.1.2 1.6.4l-.3 1.3c-.4-.2-.9-.3-1.3-.3-1 0-1.5.5-1.5 1.1 0 .8 1.2 1 2.6 1.3 1.5.3 2.9.8 2.9 2.7 0 1.3-1 2.4-2.6 2.6v1.6h-.6z'),
};
const ICON = (name) => ICONS[name] || '';

const QUALITY_KEYS = ['qualityCommon', 'qualityUnique', 'qualityMythic', 'qualityLegendary', 'qualityEpic', 'qualityRare', 'qualityUncommon'];
const QUALITY_LABELS = { qualityCommon: '普通', qualityUnique: '唯一', qualityMythic: '神话', qualityLegendary: '传说', qualityEpic: '史诗', qualityRare: '稀有', qualityUncommon: '精良' };

function renderWindow(tabs, body) {
  return '<div class="phone"><div class="window">' +
    '<div class="titlebar"><div class="info">' +
    '<span>' + ICON('clock') + '圣历 233 年 · 暮秋</span>' +
    '<span>' + ICON('location') + '王都 · 黎明酒馆</span></div>' +
    '<div class="acts"><div class="icon">' + ICON('refresh') + '</div><div class="icon">' + ICON('gear') + '</div></div></div>' +
    '<div class="tabbar">' + tabs + '</div>' +
    '<div class="content">' + body + '</div>' +
    '</div></div>';
}

export function previewHtml(c) {
  const tabIcons = ['scroll', 'user', 'briefcase', 'star', 'newspaper', 'map'];
  const tabLabels = ['任务', '信息', '持有物', '命定', '新闻', '地图'];
  const makeTabs = activeIdx => tabLabels.map((l, i) =>
    '<div class="tab' + (i === activeIdx ? ' active' : '') + '">' + ICON(tabIcons[i]) + '<span>' + l + '</span></div>'
  ).join('');

  return renderWindow(makeTabs(1), statusBody(c)) +
    renderWindow(makeTabs(2), itemsBody(c)) +
    renderWindow(makeTabs(3), destinyBody(c));
}

function statusBody(c) {
  const bars = [
    ['hp', '♥', c.resourceHp, 68],
    ['mp', '◆', c.resourceMp, 41],
    ['sp', '●', c.resourceSp, 87],
    ['exp', '★', c.resourceExp, 30],
  ].map(b =>
    '<div class="res-bar"><div class="res-ico" style="background:' + b[2] + '">' + b[1] + '</div>' +
    '<div class="res-track"><div class="res-fill" style="width:' + b[3] + '%;background:' + b[2] + '"></div></div>' +
    '<div class="res-val">' + b[3] + '/100</div></div>'
  ).join('');
  const attrs = [
    ['力量', 18], ['敏捷', 15], ['体质', 16], ['意志', 20],
    ['智力', 14], ['魅力', 17], ['幸运', 12], ['洞察', 19],
  ].map(a => '<div class="attr-item"><span class="attr-k"><span class="attr-dot"></span>' + a[0] + '</span><span class="attr-v">' + a[1] + '</span></div>').join('');
  const effects = [
    ['坚韧', '增益', 'buff', 'x2'], ['剧毒', '减益', 'debuff', 'x1'], ['鼓舞', '增益', 'buff', ''],
    ['虚弱', '减益', 'debuff', 'x3'], ['祝福', '特殊', 'special', ''],
  ].map(e => '<span class="effect-chip ' + e[2] + '">' + e[0] + '<span class="st">' + e[1] + (e[3] ? ' ' + e[3] : '') + '</span></span>').join('');
  return (
    '<div class="card"><div class="card-title">生命状态</div>' + bars + '</div>' +
    '<div class="card"><div class="card-title">属性</div><div class="attr-grid">' + attrs + '</div></div>' +
    '<div class="card"><div class="card-title">当前效果</div><div class="effect-chips">' + effects + '</div></div>'
  );
}

function itemsBody(c) {
  const items = [
    ['圣剑·斩星', '武器', '×1', c.qualityMythic],
    ['精钢长剑', '武器', '×1', c.qualityLegendary],
    ['旅者披风', '防具', '×1', c.qualityEpic],
    ['刻名银戒', '饰品', '×1', c.qualityUnique],
    ['治疗药水', '消耗品', '×5', c.qualityUncommon],
    ['古老地图残页', '任务道具', '×1', c.qualityRare],
    ['铜币袋', '杂物', '×12', c.qualityCommon],
  ].map(it =>
    '<div class="item-row"><div class="item-qm" style="--q-color:' + it[3] + '"></div>' +
    '<div class="item-main"><span class="item-name" style="--q-color:' + it[3] + '">' + it[0] + '</span>' +
    '<span class="item-type">' + it[1] + '</span></div><div class="item-meta">' + it[2] + '</div></div>'
  ).join('');
  const qualities = QUALITY_KEYS.map(k =>
    '<span class="quality-swatch"><span class="dot" style="background:' + c[k] + '"></span>' + QUALITY_LABELS[k] + '</span>'
  ).join('');
  return (
    '<div class="card"><div class="card-title">品质色</div><div class="quality-row">' + qualities + '</div></div>' +
    '<div class="card" style="margin-top:8px"><div class="card-title">背包</div>' + items + '</div>'
  );
}

function destinyBody(c) {
  const partner = (name, title, aff, tags) => {
    const t = tags.map(tag =>
      tag === '在场'
        ? '<span class="tag present">在场</span>'
        : '<span class="tag contract">命定契约</span>'
    ).join('');
    return '<div class="partner-card"><div class="partner-head"><span class="partner-name">' + name + '</span></div>' +
      '<div class="partner-tags">' + t + '</div>' +
      '<div class="aff-row"><span>好感度</span><div class="aff-track"><div class="aff-fill" style="width:' + aff + '%"></div></div><span class="aff-val">' + aff + '</span></div></div>';
  };
  return (
    '<div class="card"><div class="card-title">资产</div><div class="money-row">' +
    '<span class="m gold">' + ICON('coin') + '1,240</span>' +
    '<span class="m silver">' + ICON('coin') + '38</span>' +
    '<span class="m copper">' + ICON('coin') + '5</span></div></div>' +
    '<div style="margin-top:8px">' +
    partner('爱丽丝', '旅伴', 86, ['在场']) +
    partner('罗兰', '护卫', 64, ['在场', '命定契约']) +
    partner('梅林', '导师', 42, []) +
    '</div>'
  );
}

