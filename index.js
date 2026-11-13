import { recipients, generateLetter } from './src/engine.js';
import { apiChoices } from './src/api.js';
import { saveLetter, deleteLetter, listAllLetters } from './src/storage.js';
import { getDraft, saveDraft, clearDraft } from './src/drafts.js';
import { createBackup, downloadJson, restoreBackup } from './src/backup.js';
import { exportAsPng } from './src/export.js';

const PREFIX = 'sal';
const PREFS_KEY = 'somewhere-a-letter:preferences:v2';
const RECENTS_KEY = 'somewhere-a-letter:recent-recipients:v1';
const MAX_RESULTS = 40;
const VIEWS = ['all', 'starred', 'character', 'compose', 'reading', 'settings'];
const state = {
    selected: '', people: [], items: [], current: null, busy: false,
    request: 0, activeIndex: -1, visiblePeople: [],
    view: 'all', previousView: 'all',
};
function el(id) { return document.getElementById(PREFIX + '-' + id); }
function context() {
    if (!globalThis.SillyTavern?.getContext) throw new Error('无法访问 SillyTavern 上下文。');
    return globalThis.SillyTavern.getContext();
}
function readPrefs() {
    try {
        const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
        return {
            theme: raw.theme === 'dark' ? 'dark' : 'light',
            profileId: typeof raw.profileId === 'string' ? raw.profileId : '',
        };
    } catch {
        return { theme: 'light', profileId: '' };
    }
}
const prefs = readPrefs();
function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }
    catch { /* UI and selected profile still work for this page. */ }
}
function applyTheme(theme) {
    prefs.theme = theme === 'dark' ? 'dark' : 'light';
    el('root').dataset.theme = prefs.theme;
    el('theme').textContent = prefs.theme === 'dark' ? '☀' : '☾';
    el('theme').title = prefs.theme === 'dark' ? '切换日间模式' : '切换夜间模式';
    el('theme').setAttribute('aria-label', el('theme').title);
    el('theme-choice').value = prefs.theme;
    savePrefs();
}
function status(message, isError = false) {
    el('status').textContent = message || '';
    el('status').classList.toggle('sal-error', isError);
}
function getRecents() {
    try {
        const parsed = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string').slice(0, 6) : [];
    } catch { return []; }
}
function rememberRecipient(id) {
    try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify([id, ...getRecents().filter(x => x !== id)].slice(0, 6)));
    } catch { /* Optional usability data. */ }
}
function selectedName() {
    return state.people.find(p => p.id === state.selected)?.name || '角色';
}
function normalized(value) {
    return String(value || '').normalize('NFKC').toLocaleLowerCase();
}
function letterTitle(letter) {
    if (typeof letter.title === 'string' && letter.title.trim()) return letter.title.trim();
    const text = String(letter.body || '').trim();
    const phrases = text.split(/\r?\n|[。！？!?]/u).map(x => x.trim()).filter(Boolean);
    const line = phrases.find(x => !/^(你好|您好|hello|hi|dear|嗨)[，,！!.。]?$/iu.test(x))
        || phrases[0] || '无题来信';
    const chars = Array.from(line.replace(/\s+/gu, ' '));
    return chars.slice(0, 32).join('') + (chars.length > 32 ? '…' : '');
}
function shortSnippet(text) {
    return String(text || '').replace(/\s+/gu, ' ').trim().slice(0, 110);
}
function localDate(iso) {
    const date = new Date(iso);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : '';
}
function snapshotDraft() {
    return { title: el('subject').value, signature: el('signature').value, body: el('body').value };
}
function saveCurrentDraft() {
    if (!state.selected) {
        el('draft-hint').textContent = '选择收件人后自动保存草稿';
        return;
    }
    try {
        const draft = snapshotDraft();
        saveDraft(state.selected, draft);
        el('draft-hint').textContent = draft.body || draft.title || draft.signature
            ? '草稿已自动保存于此浏览器' : '开始写信后将自动保存草稿';
    } catch (error) {
        el('draft-hint').textContent = '草稿保存失败：' + error.message;
    }
}
function restoreCurrentDraft() {
    const draft = state.selected ? getDraft(state.selected) : null;
    el('subject').value = draft?.title || '';
    el('signature').value = draft?.signature || '';
    el('body').value = draft?.body || '';
    el('draft-hint').textContent = draft
        ? '已恢复这位收件人的未寄出草稿'
        : state.selected ? '开始写信后将自动保存草稿' : '选择收件人后自动保存草稿';
}
function fillRecipients() {
    state.people = recipients(context());
    if (!state.people.some(p => p.id === state.selected)) state.selected = '';
    renderRecipientLabel();
    if (!el('recipient-results').hidden) renderRecipients();
}
function renderRecipientLabel() {
    el('recipient-current').textContent = state.selected ? '当前收件人：' + selectedName() : '尚未选择收件人';
    el('compose-recipient').textContent = state.selected ? selectedName() : '尚未选择收件人';
    el('nav-character').disabled = !state.selected;
    el('nav-character').title = state.selected ? '查看 ' + selectedName() + ' 的信箱' : '请先搜索并选择角色';
}
function closeRecipients() {
    el('recipient-results').hidden = true;
    el('recipient-search').setAttribute('aria-expanded', 'false');
    el('recipient-search').removeAttribute('aria-activedescendant');
    state.activeIndex = -1;
}
function renderRecipients() {
    const query = normalized(el('recipient-search').value.trim());
    const recents = getRecents();
    const recentPeople = recents.map(id => state.people.find(p => p.id === id)).filter(Boolean);
    const choices = query
        ? state.people.filter(p => normalized(p.name).includes(query))
        : [...recentPeople, ...state.people.filter(p => !recents.includes(p.id))];
    const container = el('recipient-results');
    container.replaceChildren();
    state.visiblePeople = choices.slice(0, MAX_RESULTS);
    state.activeIndex = -1;
    el('recipient-search').removeAttribute('aria-activedescendant');
    const caption = document.createElement('div');
    caption.className = 'sal-result-caption';
    caption.textContent = query ? '搜索结果 · ' + choices.length + ' 位角色'
        : '角色列表 · ' + state.people.length + ' 位（最近选择优先）';
    container.append(caption);
    if (!choices.length) {
        const empty = document.createElement('p');
        empty.className = 'sal-result-empty';
        empty.textContent = '没有匹配的角色。';
        container.append(empty);
    }
    for (const [i, person] of state.visiblePeople.entries()) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sal-result';
        button.id = 'sal-result-' + i;
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(person.id === state.selected));
        const name = document.createElement('span');
        name.textContent = person.name;
        button.append(name);
        if (!query && recents.includes(person.id)) {
            const recent = document.createElement('small');
            recent.textContent = '最近';
            button.append(recent);
        }
        button.addEventListener('click', () => selectRecipient(person.id));
        container.append(button);
    }
    if (choices.length > MAX_RESULTS) {
        const more = document.createElement('div');
        more.className = 'sal-result-caption';
        more.textContent = '继续输入名字，可查看更多匹配角色';
        container.append(more);
    }
    container.hidden = false;
    el('recipient-search').setAttribute('aria-expanded', 'true');
}
function focusResult(index) {
    state.activeIndex = index;
    const choices = el('recipient-results').querySelectorAll('[role="option"]');
    choices.forEach((choice, i) => choice.classList.toggle('sal-active', i === index));
    const target = choices[index];
    if (target) {
        target.scrollIntoView({ block: 'nearest' });
        el('recipient-search').setAttribute('aria-activedescendant', target.id);
    }
}
function onRecipientKeydown(event) {
    if (event.key === 'Escape') {
        if (!el('recipient-results').hidden) {
            event.stopPropagation();
            closeRecipients();
        }
        return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
    if (el('recipient-results').hidden) renderRecipients();
    const count = state.visiblePeople.length;
    if (!count) return;
    event.preventDefault();
    if (event.key === 'Enter') {
        const person = state.visiblePeople[state.activeIndex < 0 ? 0 : state.activeIndex];
        if (person) selectRecipient(person.id);
        return;
    }
    const index = event.key === 'ArrowDown' ? (state.activeIndex + 1) % count : (state.activeIndex + count - 1) % count;
    focusResult(index);
}
function selectRecipient(id) {
    if (state.busy) return;
    const person = state.people.find(p => p.id === id);
    if (!person) return;
    const oldId = state.selected;
    const unsavedFirst = !oldId ? snapshotDraft() : null;
    state.selected = person.id;
    rememberRecipient(id);
    el('recipient-search').value = '';
    closeRecipients();
    renderRecipientLabel();
    if (oldId !== id) {
        if (!oldId && unsavedFirst && Object.values(unsavedFirst).some(Boolean) && !getDraft(id)) {
            try { saveDraft(id, unsavedFirst); } catch { /* Form survives without storage. */ }
        }
        restoreCurrentDraft();
        // Changing the selected recipient never changes the global archive view.
        if (state.view === 'character') renderArchive();
        updateNav();
    }
}
function isArchiveView() { return ['all', 'starred', 'character'].includes(state.view); }
function filteredLetters() {
    let letters = state.items;
    if (state.view === 'starred') letters = letters.filter(l => l.starred === true);
    if (state.view === 'character') letters = letters.filter(l => l.characterId === state.selected);
    const query = normalized(el('letter-search').value.trim());
    if (query) {
        letters = letters.filter(l => [
            l.characterName, l.title, letterTitle(l), l.body, l.reply, l.signature,
        ].some(value => normalized(value).includes(query)));
    }
    return letters;
}
function updateNav() {
    for (const view of ['all', 'starred', 'character']) {
        el('nav-' + view).setAttribute('aria-current', (state.view === view || (state.view === 'reading' && state.previousView === view)) ? 'page' : 'false');
    }
    const starred = state.items.filter(item => item.starred === true).length;
    el('nav-all-count').textContent = String(state.items.length);
    el('nav-starred-count').textContent = String(starred);
    el('nav-character-count').textContent = String(state.items.filter(item => item.characterId === state.selected).length);
    el('settings').setAttribute('aria-pressed', String(state.view === 'settings'));
}
function renderArchive() {
    updateNav();
    const container = el('archive');
    container.replaceChildren();
    const titles = {
        all: '所有信件',
        starred: '星标收藏',
        character: state.selected ? selectedName() + ' 的信箱' : '角色信箱',
    };
    el('archive-title').textContent = titles[state.view] || '所有信件';
    const shown = filteredLetters();
    el('archive-count').textContent = shown.length + ' 封信';
    if (!shown.length) {
        const empty = document.createElement('div');
        empty.className = 'sal-empty';
        empty.textContent = el('letter-search').value.trim() ? '没有搜索到符合条件的信件。'
            : state.view === 'starred' ? '还没有星标收藏的信。'
                : state.view === 'character' ? '这位角色还没有往来信件。' : '还没有收到任何回信。';
        container.append(empty);
        return;
    }
    for (const letter of shown) {
        const row = document.createElement('div');
        row.className = 'sal-mail-row';
        const star = document.createElement('button');
        star.type = 'button';
        star.className = 'sal-star';
        star.textContent = letter.starred === true ? '★' : '☆';
        star.title = letter.starred === true ? '取消收藏' : '收藏信件';
        star.setAttribute('aria-label', star.title);
        star.setAttribute('aria-pressed', String(letter.starred === true));
        star.addEventListener('click', () => void toggleStar(letter.id));
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sal-mail-open';
        button.dataset.id = letter.id;
        const header = document.createElement('div');
        header.className = 'sal-mail-heading';
        const name = document.createElement('strong');
        name.textContent = letter.characterName || '未知角色';
        const date = document.createElement('small');
        date.textContent = localDate(letter.createdAt);
        header.append(name, date);
        const subject = document.createElement('div');
        subject.className = 'sal-mail-subject';
        subject.textContent = letterTitle(letter);
        const snippet = document.createElement('p');
        snippet.className = 'sal-mail-snippet';
        snippet.textContent = shortSnippet(letter.reply) || shortSnippet(letter.body);
        button.append(header, subject, snippet);
        button.addEventListener('click', () => read(letter));
        row.append(star, button);
        container.append(row);
    }
}
async function refreshInbox() {
    const request = ++state.request;
    try {
        const items = await listAllLetters();
        if (request !== state.request) return;
        state.items = items;
        if (isArchiveView()) renderArchive();
        else updateNav();
    } catch (error) {
        if (request === state.request) status('读取信件失败：' + error.message, true);
    }
}
async function toggleStar(id) {
    if (state.busy) return;
    const letter = state.items.find(item => item.id === id)
        || (state.current?.id === id ? state.current : null);
    if (!letter || letter.unsaved) return;
    const updated = { ...letter, starred: letter.starred !== true };
    try {
        await saveLetter(updated);
        state.items = state.items.map(item => item.id === id ? updated : item);
        if (state.current?.id === id) state.current = updated;
        if (isArchiveView()) renderArchive();
        else updateNav();
        updateDetailStar();
        status(updated.starred ? '已加入全局星标收藏。' : '已取消收藏。');
    } catch (error) {
        status('收藏失败：' + error.message, true);
    }
}
function updateDetailStar() {
    const button = el('detail-star');
    if (!state.current) { button.hidden = true; return; }
    button.hidden = Boolean(state.current.unsaved);
    const starred = state.current.starred === true;
    button.textContent = starred ? '★ 已收藏' : '☆ 收藏';
    button.setAttribute('aria-pressed', String(starred));
}
function setView(view) {
    if (!VIEWS.includes(view) || (state.busy && view !== 'reading')) return;
    if (isArchiveView()) state.previousView = state.view;
    state.view = view;
    el('compose').hidden = view !== 'compose';
    el('reading').hidden = view !== 'reading';
    el('archive-view').hidden = !['all', 'starred', 'character'].includes(view);
    el('settings-view').hidden = view !== 'settings';
    el('search-wrap').hidden = !isArchiveView();
    el('back').hidden = view !== 'reading';
    if (isArchiveView()) renderArchive();
    else updateNav();
    if (view === 'settings') fillApiChoices();
    if (view === 'compose') el('subject').focus();
}
function read(letter) {
    if (isArchiveView()) state.previousView = state.view;
    state.current = letter;
    el('read-title').textContent = letterTitle(letter);
    el('read-meta').textContent = '来自 ' + letter.characterName + ' · ' + new Date(letter.createdAt).toLocaleString();
    el('original').textContent = letter.body;
    el('reply').textContent = letter.reply;
    el('sign').textContent = letter.signature ? '署名：' + letter.signature : '匿名来信';
    el('delete').hidden = Boolean(letter.unsaved);
    updateDetailStar();
    setView('reading');
    status('');
}
function returnToList() {
    state.current = null;
    setView(state.previousView === 'character' && !state.selected ? 'all' : state.previousView);
}
function setBusy(value) {
    state.busy = value;
    el('send').disabled = value;
    el('send').textContent = value ? '正在等待回信…' : '寄出这封信';
    el('recipient-search').disabled = value;
    el('new').disabled = value;
    for (const view of ['all', 'starred', 'character']) el('nav-' + view).disabled = value || (view === 'character' && !state.selected);
    el('settings').disabled = value;
    closeRecipients();
}
async function send(event) {
    event.preventDefault();
    if (state.busy) return;
    const body = el('body').value.trim();
    if (!state.selected || !body) {
        status('请先选择收件人，并写下信件正文。', true);
        return;
    }
    const letter = {
        id: globalThis.crypto?.randomUUID?.() || String(Date.now()) + '-' + String(Math.random()).slice(2),
        characterId: state.selected,
        characterName: selectedName(),
        createdAt: new Date().toISOString(),
        title: el('subject').value.trim(),
        signature: el('signature').value.trim(),
        body, reply: '', starred: false,
    };
    setBusy(true);
    status('信件已寄出，正在等待回信…');
    try {
        const response = await generateLetter(context(), letter.characterId, letter, prefs.profileId);
        letter.reply = response.text;
        letter.characterName = response.characterName;
        let warning = '';
        try {
            await saveLetter(letter);
            await refreshInbox();
        } catch (error) {
            warning = '已收到回信，但本地归档失败：' + error.message + '。请立即复制或导出。';
            letter.unsaved = true;
        }
        if (!warning) {
            try { clearDraft(letter.characterId); } catch { /* Archived successfully. */ }
            el('subject').value = '';
            el('signature').value = '';
            el('body').value = '';
            el('draft-hint').textContent = '回信已送达；草稿已清空';
        }
        state.previousView = 'character';
        read(letter);
        status(warning || '回信已送达并存档。每封信都是一次全新的相遇。', Boolean(warning));
    } catch (error) {
        status('寄信失败：' + (error.message || String(error)), true);
    } finally {
        setBusy(false);
    }
}
async function removeCurrent() {
    if (!state.current || state.busy) return;
    if (!window.confirm('确定永久删除这组来信与回信吗？删除后无法恢复。')) return;
    try {
        await deleteLetter(state.current.id);
        await refreshInbox();
        returnToList();
        status('已删除这封信。');
    } catch (error) { status('删除失败：' + error.message, true); }
}
function copyReply() {
    if (!state.current) return;
    navigator.clipboard.writeText(state.current.reply)
        .then(() => status('已复制回信。'))
        .catch(() => status('复制失败，请手动复制信件正文。', true));
}
function saveImage() {
    if (!state.current) return;
    try {
        const pages = exportAsPng(state.current);
        status(pages === 1 ? '已开始下载 PNG 信纸。' : '已尝试下载 ' + pages + ' 页 PNG，请留意浏览器的连续下载权限。');
    } catch (error) { status('图片导出失败：' + error.message, true); }
}
async function downloadBackup() {
    try {
        const data = await createBackup();
        downloadJson(data);
        status('已导出 ' + data.letters.length + ' 封信及 ' + data.drafts.length + ' 份草稿的 JSON 备份。');
    } catch (error) { status('备份失败：' + error.message, true); }
}
async function uploadBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
        const result = await restoreBackup(file, (letters, drafts) =>
            window.confirm('确认恢复 ' + letters + ' 封信及 ' + drafts + ' 份草稿？已有内容不会被覆盖。'));
        if (!result) { status('已取消恢复。'); return; }
        await refreshInbox();
        status('已恢复 ' + result.added + ' 封信，跳过 ' + result.skipped + ' 封重复信，新增 '
            + result.drafts + ' 份草稿。' + (result.warning || ''), Boolean(result.warning));
    } catch (error) { status('恢复失败：' + error.message, true); }
}
function fillApiChoices() {
    const select = el('api-choice');
    select.replaceChildren();
    const choices = apiChoices(context());
    for (const item of choices) {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name + (item.description ? ' · ' + item.description : '');
        select.append(option);
    }
    if (!choices.some(item => item.id === prefs.profileId)) {
        const unavailable = document.createElement('option');
        unavailable.value = prefs.profileId;
        unavailable.textContent = '⚠ 已选连接不可用，请重新选择';
        select.append(unavailable);
    }
    select.value = prefs.profileId;
    el('api-hint').textContent = prefs.profileId
        ? '信箱使用所选连接预设独立生成回信，不会切换主聊天 API；需要先在酒馆连接管理器中创建有效连接。'
        : '默认跟随酒馆当前 API，无需额外配置。';
}
function show() {
    el('overlay').hidden = false;
    el('open').setAttribute('aria-expanded', 'true');
    void refreshInbox();
    fillRecipients();
    updateNav();
    el('close').focus();
}
function hide() {
    if (state.busy) return;
    closeRecipients();
    el('overlay').hidden = true;
    el('open').setAttribute('aria-expanded', 'false');
    el('open').focus();
}
function buildUi() {
    const root = document.createElement('div');
    root.id = 'sal-root';
    root.dataset.theme = prefs.theme;
    root.innerHTML = [
        '<button id="sal-open" class="sal-float" type="button" aria-expanded="false" title="世界某处的来信">✉ <span>信箱</span></button>',
        '<div id="sal-overlay" class="sal-overlay" hidden>',
          '<div class="sal-panel" role="dialog" aria-modal="true" aria-label="世界某处的来信">',
            '<header class="sal-header">',
              '<div class="sal-brand"><small>SOMEWHERE, A LETTER</small><h2>世界某处的来信</h2></div>',
              '<div id="sal-search-wrap" class="sal-top-search"><input id="sal-letter-search" type="search" autocomplete="off" placeholder="⌕ 搜索信件、角色、回信内容…" aria-label="搜索信件"/></div>',
              '<div class="sal-header-actions"><button id="sal-back" class="sal-icon-btn" type="button" title="返回信件列表" hidden>←</button><button id="sal-theme" class="sal-icon-btn" type="button" title="日夜切换">☾</button><button id="sal-settings" class="sal-icon-btn" type="button" title="信箱设置" aria-label="信箱设置">⚙</button><button id="sal-close" class="sal-icon-btn" type="button" aria-label="关闭信箱">×</button></div>',
            '</header>',
            '<div class="sal-content">',
              '<aside class="sal-sidebar">',
                '<button id="sal-new" class="sal-new" type="button">✎ 写一封信</button>',
                '<nav class="sal-nav" aria-label="信箱导航">',
                  '<button id="sal-nav-all" type="button">▣ <span>所有信件</span><small id="sal-nav-all-count">0</small></button>',
                  '<button id="sal-nav-starred" type="button">★ <span>星标收藏</span><small id="sal-nav-starred-count">0</small></button>',
                  '<button id="sal-nav-character" type="button">✉ <span>角色信箱</span><small id="sal-nav-character-count">0</small></button>',
                '</nav>',
                '<div class="sal-recipient-area"><label for="sal-recipient-search">收件人 / RECIPIENT</label>',
                  '<div id="sal-picker" class="sal-picker"><input id="sal-recipient-search" type="search" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" aria-controls="sal-recipient-results" autocomplete="off" placeholder="搜索角色名称…"/><div id="sal-recipient-results" class="sal-results" role="listbox" aria-label="收件人" hidden></div></div>',
                  '<div id="sal-recipient-current" class="sal-current" aria-live="polite">尚未选择收件人</div>',
                '</div>',
                '<p class="sal-sidebar-note">星标收藏跨所有角色。选择收件人不会改变当前归档视图。</p>',
              '</aside>',
              '<main class="sal-main">',
                '<section id="sal-archive-view"><div class="sal-list-heading"><h3 id="sal-archive-title">所有信件</h3><small id="sal-archive-count">0 封信</small></div><div id="sal-archive" class="sal-archive"></div></section>',
                '<form id="sal-compose" hidden><p class="sal-eyebrow">A LETTER TO SOMEONE, SOMEWHERE</p><h3>写一封信</h3><p class="sal-compose-to">致：<strong id="sal-compose-recipient">尚未选择收件人</strong></p>',
                  '<label for="sal-subject">主题（可选）</label><input id="sal-subject" maxlength="150" placeholder="今天想说的一件事…"/>',
                  '<label for="sal-signature">署名（可选，留空为匿名）</label><input id="sal-signature" maxlength="80" placeholder="一个陌生人"/>',
                  '<label for="sal-body">信件正文</label><textarea id="sal-body" rows="11" required placeholder="你好。我们可能从未见过面……"></textarea>',
                  '<p id="sal-draft-hint" class="sal-draft-hint">选择收件人后自动保存草稿</p><button id="sal-send" class="sal-primary" type="submit">寄出这封信</button>',
                '</form>',
                '<article id="sal-reading" hidden><p class="sal-eyebrow">A LETTER HAS ARRIVED</p><h3 id="sal-read-title"></h3><p id="sal-read-meta" class="sal-meta"></p>',
                  '<section><h4>寄出的信</h4><p id="sal-sign" class="sal-meta"></p><div id="sal-original" class="sal-letter"></div></section>',
                  '<section class="sal-response"><h4>收到的回信</h4><div id="sal-reply" class="sal-letter"></div></section>',
                  '<div class="sal-actions"><button id="sal-detail-star" type="button">☆ 收藏</button><button id="sal-copy" type="button">复制回信</button><button id="sal-image" type="button">导出 PNG</button><button id="sal-delete" class="sal-danger" type="button">删除存档</button></div>',
                '</article>',
                '<section id="sal-settings-view" hidden><p class="sal-eyebrow">MAILBOX PREFERENCES</p><h3>信箱设置</h3>',
                  '<div class="sal-setting-section"><label for="sal-api-choice">回信 API 连接</label><select id="sal-api-choice"></select><p id="sal-api-hint" class="sal-setting-hint"></p></div>',
                  '<div class="sal-setting-section"><label for="sal-theme-choice">界面主题</label><select id="sal-theme-choice"><option value="light">☀ 日间模式</option><option value="dark">☾ 夜间模式</option></select></div>',
                  '<div class="sal-setting-section"><h4>备份与恢复</h4><p class="sal-setting-hint">备份包含所有角色的信件、星标与草稿，保存在你的设备上。恢复不会覆盖已有信件。</p>',
                    '<div class="sal-backup-actions"><button id="sal-backup-export" type="button">↓ 导出 JSON 备份</button><button id="sal-backup-import" type="button">↑ 从 JSON 恢复</button><input id="sal-backup-file" type="file" accept=".json,application/json" hidden/></div>',
                    '<p class="sal-setting-hint">备份可能包含私人信件内容，请妥善保存。</p>',
                  '</div>',
                '</section>',
                '<p id="sal-status" class="sal-status" role="status" aria-live="polite"></p>',
              '</main>',
            '</div>',
            '<footer class="sal-footer">单次独立通信 · 仅角色卡及主世界书 · 本地保存，不读取聊天记忆</footer>',
          '</div>',
        '</div>',
    ].join('');
    document.body.append(root);
    el('open').addEventListener('click', show);
    el('close').addEventListener('click', hide);
    el('overlay').addEventListener('click', event => { if (event.target === el('overlay')) hide(); });
    el('theme').addEventListener('click', () => applyTheme(prefs.theme === 'dark' ? 'light' : 'dark'));
    el('theme-choice').addEventListener('change', () => applyTheme(el('theme-choice').value));
    el('settings').addEventListener('click', () => setView('settings'));
    el('back').addEventListener('click', returnToList);
    el('new').addEventListener('click', () => setView('compose'));
    for (const view of ['all', 'starred', 'character']) {
        el('nav-' + view).addEventListener('click', () => setView(view));
    }
    el('letter-search').addEventListener('input', () => { if (isArchiveView()) renderArchive(); });
    el('recipient-search').addEventListener('focus', renderRecipients);
    el('recipient-search').addEventListener('input', renderRecipients);
    el('recipient-search').addEventListener('keydown', onRecipientKeydown);
    document.addEventListener('pointerdown', event => {
        if (!el('picker').contains(event.target)) closeRecipients();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !el('overlay').hidden) {
            if (!el('recipient-results').hidden) closeRecipients();
            else hide();
        }
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && state.view === 'compose' && !el('overlay').hidden) {
            el('compose').requestSubmit();
        }
    });
    el('compose').addEventListener('submit', send);
    for (const id of ['subject', 'signature', 'body']) el(id).addEventListener('input', saveCurrentDraft);
    el('detail-star').addEventListener('click', () => { if (state.current) void toggleStar(state.current.id); });
    el('copy').addEventListener('click', copyReply);
    el('image').addEventListener('click', saveImage);
    el('delete').addEventListener('click', () => void removeCurrent());
    el('api-choice').addEventListener('change', () => {
        prefs.profileId = el('api-choice').value;
        savePrefs();
        fillApiChoices();
        status(prefs.profileId ? '已选择信箱专用连接；不影响主聊天 API。' : '已设置为跟随酒馆当前 API。');
    });
    el('backup-export').addEventListener('click', () => void downloadBackup());
    el('backup-import').addEventListener('click', () => el('backup-file').click());
    el('backup-file').addEventListener('change', event => void uploadBackup(event));
    fillRecipients();
    restoreCurrentDraft();
    applyTheme(prefs.theme);
    setView('all');
    void refreshInbox();
}
function initialize() {
    if (document.getElementById('sal-root')) return;
    try { buildUi(); }
    catch (error) { console.error('[Somewhere, a Letter] 初始化失败', error); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
