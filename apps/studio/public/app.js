const $ = (sel) => document.querySelector(sel);
const state = { current: null, dirty: false, preview: false, timer: null };

function msg(text, err = false) {
  const el = $('#msg');
  el.textContent = text;
  el.classList.toggle('err', err);
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function loadStatus() {
  try {
    const s = await api('/api/status');
    const branch = (s.git.match(/^## ([^\s.]+)/) || [])[1] || '?';
    const dirty = s.git.split('\n').filter((l) => l && !l.startsWith('##')).length;
    $('#status').textContent = `${branch} · 未提交 ${dirty} · inbox ${s.inbox ? `${s.inbox.passed}/${s.inbox.total}` : '—'}`;
    document.title = `${state.current ? state.current.id : '操作台'} · 折叠之后`;
  } catch (e) {
    $('#status').textContent = '离线';
  }
}

async function loadInbox() {
  try {
    const d = await api('/api/inbox');
    $('#inbox').textContent = d.date ? `${d.date} · 越线 ${d.counts.passed} / 候选 ${d.counts.total}` : '还没有 inbox 数据';
    $('#inbox').title = (d.items || []).map((x) => `[${x.score}] ${x.title}`).join('\n');
  } catch {
    $('#inbox').textContent = 'inbox 读取失败';
  }
}

function renderList(el, items, type) {
  el.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li');
    if (state.current && state.current.type === type && state.current.id === it.id) li.classList.add('active');
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = it.title;
    const m = document.createElement('span');
    m.className = 'm';
    m.textContent = type === 'weekly' ? `${it.week}${it.draft ? ' · 草稿' : ''}` : `${it.date}${it.draft ? ' · 草稿' : ''}`;
    if (it.draft) m.classList.add('draft');
    li.append(t, m);
    li.addEventListener('click', () => openFile(type, it.id));
    el.append(li);
  }
}

async function loadList() {
  const d = await api('/api/list');
  renderList($('#weekly-list'), d.weekly, 'weekly');
  renderList($('#deep-list'), d.deep, 'deep');
  return d;
}

async function openFile(type, id) {
  if (state.dirty && !confirm('当前有未保存的修改，继续会丢失。确定？')) return;
  const d = await api(`/api/file?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`);
  state.current = { type, id };
  state.dirty = false;
  $('#source').value = d.content;
  $('#source').scrollTop = 0;
  $('#source').setSelectionRange(0, 0);
  $('#file-title').textContent = id;
  $('#file-meta').textContent = type === 'weekly' ? '周报' : '深度';
  $('#save').disabled = false;
  $('#preview-toggle').disabled = false;
  $('#publish').disabled = false;
  await loadList();
  if (state.preview) await renderPreview();
  msg(`已打开 ${type}/${id}`);
  $('#source').focus();
}

async function save() {
  if (!state.current) return;
  await api('/api/file', {
    method: 'PUT',
    body: JSON.stringify({ ...state.current, content: $('#source').value }),
  });
  state.dirty = false;
  msg(`已保存 ${state.current.id}`);
  await loadStatus();
  await loadList();
}

async function renderPreview() {
  const d = await api('/api/preview', { method: 'POST', body: JSON.stringify({ content: $('#source').value }) });
  $('#preview').innerHTML = d.html;
  if (d.meta && d.meta.title) {
    $('#file-title').textContent = d.meta.title;
    $('#file-meta').textContent = [d.meta.week, d.meta.date, d.meta.draft ? '草稿' : ''].filter(Boolean).join(' · ');
  }
}

function togglePreview() {
  state.preview = !state.preview;
  $('#preview').hidden = !state.preview;
  $('.panes').classList.toggle('split', state.preview);
  $('#preview-toggle').textContent = state.preview ? '收起预览' : '预览';
  if (state.preview) renderPreview().catch((e) => msg(e.message, true));
}

async function publish() {
  if (!state.current) return;
  await save();
  const message = prompt('提交说明', `content: ${state.current.id}`);
  if (message === null) return;
  msg('正在提交并推送…');
  const r = await api('/api/publish', { method: 'POST', body: JSON.stringify({ message }) });
  msg(r.skipped ? r.log : '已推送，站点会自动部署');
  console.log(r.log);
  await loadStatus();
}

async function runStep(step) {
  const names = { fetch: '采集', triage: '预筛', draft: '生成周报草稿' };
  msg(`正在${names[step]}…`);
  const r = await api('/api/run', { method: 'POST', body: JSON.stringify({ step }) });
  const tail = r.out.split('\n').slice(-6).join('\n');
  msg(`${names[step]}完成（退出码 ${r.code}）`);
  $('#inbox').title = r.out;
  await loadStatus();
  await loadList();
  if (step === 'draft') {
    const d = await api('/api/list');
    const draft = d.weekly.find((x) => x.draft);
    if (draft) await openFile('weekly', draft.id);
  }
  console.log(r.out);
}

async function newContent(type) {
  const today = new Date().toISOString().slice(0, 10);
  if (type === 'weekly') {
    const week = prompt('周报编号（如 2026-W44）', `${today.slice(0, 4)}-W${String(Math.ceil((new Date(today) - new Date(today.slice(0, 4) + '-01-01')) / 604800000)).padStart(2, '0')}`);
    if (!week) return;
    const title = prompt('标题', `周报 ${week}`);
    if (title === null) return;
    const r = await api('/api/new', { method: 'POST', body: JSON.stringify({ type, title, slug: week }) });
    await loadList();
    await openFile('weekly', r.id);
  } else {
    const slug = prompt('文件名（小写字母/数字/连字符）', `note-${today}`);
    if (!slug) return;
    const title = prompt('标题', '未命名深度');
    if (title === null) return;
    const r = await api('/api/new', { method: 'POST', body: JSON.stringify({ type, title, slug }) });
    await loadList();
    await openFile('deep', r.id);
  }
}

$('#source').addEventListener('input', () => {
  state.dirty = true;
  if (state.preview) {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => renderPreview().catch(() => {}), 500);
  }
});
$('#save').addEventListener('click', () => save().catch((e) => msg(e.message, true)));
$('#preview-toggle').addEventListener('click', togglePreview);
$('#publish').addEventListener('click', () => publish().catch((e) => msg(e.message, true)));
$('#refresh').addEventListener('click', () => { loadList(); loadStatus(); loadInbox(); });
$('#run-fetch').addEventListener('click', () => runStep('fetch').catch((e) => msg(e.message, true)));
$('#run-triage').addEventListener('click', () => runStep('triage').catch((e) => msg(e.message, true)));
$('#draft-weekly').addEventListener('click', () => runStep('draft').catch((e) => msg(e.message, true)));
$('#new-weekly').addEventListener('click', () => newContent('weekly').catch((e) => msg(e.message, true)));
$('#new-deep').addEventListener('click', () => newContent('deep').catch((e) => msg(e.message, true)));

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    save().catch((err) => msg(err.message, true));
  }
});
window.addEventListener('beforeunload', (e) => {
  if (state.dirty) e.preventDefault();
});

loadStatus();
loadInbox();
loadList().catch((e) => msg(e.message, true));
