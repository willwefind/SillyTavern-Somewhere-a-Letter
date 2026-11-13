import { recipients, generateLetter } from './src/engine.js';
import { saveLetter, listLetters, deleteLetter } from './src/storage.js';
import { getDraft, saveDraft, clearDraft } from './src/drafts.js';
import { createBackup, downloadJson, restoreBackup } from './src/backup.js';
import { exportAsPng } from './src/export.js';

const PREFIX = 'sal';
const RECENTS_KEY = 'somewhere-a-letter:recent-recipients:v1';
const MAX_RESULTS = 40;
let state = { selected: '', people: [], items: [], current: null, busy: false, request: 0, activeIndex: -1, visiblePeople: [], filter: 'all' };

function el(id) { return document.getElementById(PREFIX + '-' + id); }
function context() {
    if (!globalThis.SillyTavern?.getContext) throw new Error('无法访问 SillyTavern 上下文。');
    return SillyTavern.getContext();
}
function status(message, error = false) {
    el('status').textContent = message || '';
    el('status').classList.toggle('sal-error', error);
}
function mode(name) {
    el('compose').hidden = name !== 'compose';
    el('reading').hidden = name !== 'reading';
}
function selectedName() {
    return state.people.find(person => person.id === state.selected)?.name || '角色';
}
function setBusy(value) {
    state.busy = value;
    el('send').disabled = value;
    el('send').textContent = value ? '正在等待回信…' : '寄出这封信';
    el('recipient-search').disabled = value;
    el('recipient-results').hidden = true;
    el('recipient-search').setAttribute('aria-expanded', 'false');
    el('new').disabled = value;
}
function show() {
    const overlay = el('overlay');
    overlay.hidden = false;
    el('open').setAttribute('aria-expanded', 'true');
    el('close').focus();
}
function hide() {
    if (state.busy) return;
    el('overlay').hidden = true;
    el('open').setAttribute('aria-expanded', 'false');
    el('open').focus();
}
function getRecents() {
    try {
        const ids = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
        return Array.isArray(ids) ? ids.filter(id => typeof id === 'string').slice(0, 6) : [];
    } catch {
        return [];
    }
}
function rememberRecipient(id) {
    try {
        const ids = [id, ...getRecents().filter(item => item !== id)].slice(0, 6);
        localStorage.setItem(RECENTS_KEY, JSON.stringify(ids));
    } catch {
        // Selection still works when storage is blocked.
    }
}
function renderCurrentRecipient() {
    el('recipient-current').textContent = state.selected
        ? '当前收件人：' + selectedName()
        : '尚未选择收件人';
}
function fillRecipients() {
    state.people = recipients(context());
    if (!state.people.some(person => person.id === state.selected)) state.selected = '';
    renderCurrentRecipient();
    if (!el('recipient-results').hidden) renderRecipients();
}
function closeRecipients() {
    el('recipient-results').hidden = true;
    el('recipient-search').setAttribute('aria-expanded', 'false');
    el('recipient-search').removeAttribute('aria-activedescendant');
    state.activeIndex = -1;
}
function normalized(text) {
    return String(text || '').normalize('NFKC').toLocaleLowerCase();
}
function renderRecipients() {
    const query = normalized(el('recipient-search').value.trim());
    const recentIds = getRecents();
    const recent = recentIds.map(id => state.people.find(p => p.id === id)).filter(Boolean);
    const ordered = query
        ? state.people.filter(person => normalized(person.name).includes(query))
        : [...recent, ...state.people.filter(person => !recentIds.includes(person.id))];
    const result = el('recipient-results');
    result.replaceChildren();
    state.visiblePeople = ordered.slice(0, MAX_RESULTS);
    state.activeIndex = -1;
    el('recipient-search').removeAttribute('aria-activedescendant');
    const caption = document.createElement('div');
    caption.className = 'sal-result-caption';
    caption.textContent = query
        ? '搜索结果 · ' + ordered.length + ' 位角色'
        : (recent.length ? '最近选择优先 · 共 ' + state.people.length + ' 位角色' : '全部角色 · ' + state.people.length + ' 位');
    result.append(caption);
    if (!ordered.length) {
        const empty = document.createElement('div');
        empty.className = 'sal-result-empty';
        empty.textContent = query ? '找不到匹配的角色，请尝试角色卡中的名字。' : '酒馆中还没有角色卡。';
        result.append(empty);
    }
    for (const [i, person] of state.visiblePeople.entries()) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sal-result';
        button.id = 'sal-result-' + i;
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(person.id === state.selected));
        button.dataset.index = String(i);
        const name = document.createElement('span');
        name.textContent = person.name;
        button.append(name);
        if (!query && recentIds.includes(person.id)) {
            const small = document.createElement('small');
            small.textContent = '最近';
            button.append(small);
        }
        button.addEventListener('click', () => selectRecipient(person.id));
        result.append(button);
    }
    if (ordered.length > MAX_RESULTS) {
        const hint = document.createElement('div');
        hint.className = 'sal-result-caption';
        hint.textContent = '还有更多角色，请输入名字缩小范围。';
        result.append(hint);
    }
    result.hidden = false;
    el('recipient-search').setAttribute('aria-expanded', 'true');
}
function focusResult(index) {
    state.activeIndex = index;
    const options = el('recipient-results').querySelectorAll('[role="option"]');
    options.forEach((item, i) => item.classList.toggle('sal-active', i === index));
    const active = options[index];
    if (active) {
        active.scrollIntoView({ block: 'nearest' });
        el('recipient-search').setAttribute('aria-activedescendant', active.id);
    } else el('recipient-search').removeAttribute('aria-activedescendant');
}
function selectRecipient(id) {
    if (state.busy) return;
    const person = state.people.find(item => item.id === id);
    if (!person) return;
    const changed = state.selected !== id;
    const hadRecipient = Boolean(state.selected);
    const unassigned = !hadRecipient ? snapshotDraft() : null;
    state.selected = id;
    rememberRecipient(id);
    el('recipient-search').value = '';
    closeRecipients();
    renderCurrentRecipient();
    if (changed) {
        // A letter drafted before the first recipient is chosen must not disappear.
        if (!hadRecipient && unassigned && !getDraft(id)) {
            try { saveDraft(id, unassigned); } catch { /* Form remains usable. */ }
        }
        restoreCurrentDraft();
        compose();
        void refreshList();
    }
}
function onSearchKeydown(event) {
    if (event.key === 'Escape') {
        if (!el('recipient-results').hidden) {
            event.stopPropagation();
            closeRecipients();
        }
        return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
    if (el('recipient-results').hidden) renderRecipients();
    const count = state.visiblePeople.length;
    if (!count) return;
    if (event.key === 'Enter') {
        event.preventDefault();
        const person = state.visiblePeople[state.activeIndex >= 0 ? state.activeIndex : 0];
        if (person) selectRecipient(person.id);
        return;
    }
    event.preventDefault();
    const next = event.key === 'ArrowDown'
        ? (state.activeIndex + 1) % count
        : (state.activeIndex + count - 1) % count;
    focusResult(next);
}
function letterTitle(letter) {
    if (typeof letter.title === 'string' && letter.title.trim()) return letter.title.trim();
    const text = String(letter.body || '').trim();
    const phrases = text.split(/\r?\n|[。！？!?]/u).map(line => line.trim()).filter(Boolean);
    const first = phrases.find(line => !/^(你好|您好|hello|hi|dear|嗨)[，,！!.。]?$/iu.test(line)) || phrases[0] || '无题来信';
    const chars = Array.from(first.replace(/\s+/gu, ' '));
    return chars.slice(0, 28).join('') + (chars.length > 28 ? '…' : '');
}
function updateFilterButtons() {
    el('filter-all').setAttribute('aria-pressed', String(state.filter === 'all'));
    el('filter-starred').setAttribute('aria-pressed', String(state.filter === 'starred'));
}
function renderArchive() {
    const list = el('archive');
    list.replaceChildren();
    updateFilterButtons();
    const all = state.items;
    const starred = all.filter(item => item.starred === true);
    el('count').textContent = all.length + ' 封 · ' + starred.length + ' 封收藏';
    const visible = state.filter === 'starred' ? starred : all;
    if (!visible.length) {
        const empty = document.createElement('p');
        empty.className = 'sal-empty';
        empty.textContent = state.filter === 'starred' ? '还没有收藏的信件。' : '还没有往来的信。';
        list.append(empty);
        return;
    }
    for (const letter of visible) {
        const row = document.createElement('div');
        row.className = 'sal-item-row';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sal-item';
        button.dataset.id = letter.id;
        const title = document.createElement('strong');
        title.textContent = letterTitle(letter);
        const date = document.createElement('small');
        date.textContent = new Date(letter.createdAt).toLocaleDateString();
        button.append(title, date);
        button.addEventListener('click', () => read(letter));
        const star = document.createElement('button');
        star.type = 'button';
        star.className = 'sal-star';
        star.textContent = letter.starred === true ? '★' : '☆';
        star.setAttribute('aria-label', letter.starred === true ? '取消收藏' : '收藏信件');
        star.setAttribute('aria-pressed', String(letter.starred === true));
        star.title = star.getAttribute('aria-label');
        star.addEventListener('click', () => void toggleStar(letter.id));
        row.append(button, star);
        list.append(row);
    }
}
async function toggleStar(id) {
    if (state.busy) return;
    const target = state.items.find(item => item.id === id)
        || (state.current?.id === id ? state.current : null);
    if (!target || target.unsaved) return;
    const updated = { ...target, starred: target.starred !== true };
    try {
        await saveLetter(updated);
        state.items = state.items.map(item => item.id === id ? updated : item);
        if (state.current?.id === id) state.current = updated;
        renderArchive();
        updateDetailStar();
        status(updated.starred ? '这封信已加入收藏。' : '已取消收藏。');
    } catch (error) {
        status('收藏状态保存失败：' + (error.message || String(error)), true);
    }
}
function updateDetailStar() {
    const button = el('detail-star');
    const letter = state.current;
    button.hidden = !letter || Boolean(letter.unsaved);
    if (!letter) return;
    const starred = letter.starred === true;
    button.textContent = starred ? '★ 已收藏' : '☆ 收藏';
    button.setAttribute('aria-pressed', String(starred));
}
function snapshotDraft() {
    return {
        title: el('subject').value,
        signature: el('signature').value,
        body: el('body').value,
    };
}
function saveCurrentDraft() {
    const draft = snapshotDraft();
    if (!state.selected) {
        el('draft-hint').textContent = '选择收件人后自动保存草稿';
        return;
    }
    try {
        saveDraft(state.selected, draft);
        el('draft-hint').textContent = draft.body || draft.title || draft.signature
            ? '草稿已自动保存于此浏览器'
            : '开始写信后将自动保存草稿';
    } catch (error) {
        el('draft-hint').textContent = '草稿保存失败：' + (error.message || String(error));
    }
}
function restoreCurrentDraft() {
    const draft = state.selected ? getDraft(state.selected) : null;
    el('subject').value = draft?.title || '';
    el('signature').value = draft?.signature || '';
    el('body').value = draft?.body || '';
    el('draft-hint').textContent = draft
        ? '已恢复这位收件人的未寄出草稿'
        : (state.selected ? '开始写信后将自动保存草稿' : '选择收件人后自动保存草稿');
}
async function downloadBackup() {
    try {
        const backup = await createBackup();
        downloadJson(backup);
        status('已导出 ' + backup.letters.length + ' 封信和 ' + backup.drafts.length + ' 份草稿。请妥善保存 JSON 文件。');
    } catch (error) {
        status('备份失败：' + (error.message || String(error)), true);
    }
}
async function uploadBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
        const result = await restoreBackup(file, (letters, drafts) =>
            window.confirm('即将从此文件恢复 ' + letters + ' 封信与 ' + drafts + ' 份草稿。已有信件和草稿不会被覆盖。是否继续？'));
        if (!result) {
            status('已取消备份恢复。');
            return;
        }
        await refreshList();
        status('已恢复 ' + result.added + ' 封信，跳过 ' + result.skipped + ' 封已有信；新增 '
            + result.drafts + ' 份草稿。' + (result.warning || ''), Boolean(result.warning));
    } catch (error) {
        status('恢复失败：' + (error.message || String(error)), true);
    }
}
async function refreshList() {
    const thisRequest = ++state.request;
    state.items = [];
    if (!state.selected) {
        renderArchive();
        status(state.people.length ? '搜索并选择一位收件人。' : '请先在酒馆中创建或导入角色卡。', !state.people.length);
        return;
    }
    try {
        const items = await listLetters(state.selected);
        if (thisRequest !== state.request) return;
        state.items = items;
        renderArchive();
    } catch (error) {
        if (thisRequest === state.request) status(error.message || '读取本地信件失败。', true);
    }
}
function read(letter) {
    state.current = letter;
    el('read-title').textContent = letter.title || '一封无题的信';
    el('read-meta').textContent = '致 ' + letter.characterName + ' · ' + new Date(letter.createdAt).toLocaleString();
    el('original').textContent = letter.body;
    el('reply').textContent = letter.reply;
    el('sign').textContent = letter.signature ? '署名：' + letter.signature : '匿名来信';
    el('delete').hidden = Boolean(letter.unsaved);
    updateDetailStar();
    mode('reading');
    status('');
}
function compose() {
    if (state.busy) return;
    state.current = null;
    mode('compose');
    status('每一封信都是独立通信。角色不会读取旧信件或当前聊天。');
}
async function send(event) {
    event.preventDefault();
    if (state.busy) return;
    const body = el('body').value.trim();
    if (!state.selected || !body) {
        status('请选择角色并写下信件内容。', true);
        return;
    }
    const letter = {
        id: globalThis.crypto?.randomUUID?.() || String(Date.now()) + '-' + String(Math.random()).slice(2),
        characterId: state.selected,
        characterName: selectedName(),
        createdAt: new Date().toISOString(),
        title: el('subject').value.trim(),
        signature: el('signature').value.trim(),
        body,
        reply: '',
    };
    setBusy(true);
    status('信已寄出，正在等待一封回信…');
    try {
        const output = await generateLetter(context(), letter.characterId, letter);
        letter.reply = output.text;
        letter.characterName = output.characterName;
        let saveWarning = '';
        try {
            await saveLetter(letter);
            await refreshList();
        } catch (saveError) {
            letter.unsaved = true;
            saveWarning = '回信已生成但本地保存失败：' + saveError.message + '。请立即复制或导出。';
        }
        read(letter);
        if (!saveWarning) {
            try { clearDraft(letter.characterId); }
            catch { /* The sent letter is safely archived. */ }
            el('subject').value = '';
            el('body').value = '';
            el('signature').value = '';
            el('draft-hint').textContent = '已寄出，草稿已清空';
        }
        status(saveWarning || '回信已送达并存档；旧信不会被用于下一次生成。', Boolean(saveWarning));
    } catch (error) {
        status('寄信失败：' + (error.message || String(error)), true);
    } finally {
        setBusy(false);
    }
}
async function removeCurrent() {
    if (!state.current || state.busy) return;
    if (!window.confirm('确定删除这组原信和回信吗？删除后无法恢复。')) return;
    try {
        await deleteLetter(state.current.id);
        state.current = null;
        compose();
        await refreshList();
        status('已从本地信箱删除。');
    } catch (error) { status(error.message || '删除失败。', true); }
}
function copyReply() {
    if (!state.current) return;
    const text = state.current.reply;
    navigator.clipboard.writeText(text)
        .then(() => status('回信文字已复制。'))
        .catch(() => status('复制失败，请手动选中回信文字复制。', true));
}
function saveImage() {
    if (!state.current) return;
    try {
        const pages = exportAsPng(state.current);
        status(pages === 1 ? '已开始下载信纸 PNG。' : '已尝试下载 ' + pages + ' 页 PNG；部分浏览器可能拦截连续下载。');
    } catch (error) { status(error.message || '图片导出失败。', true); }
}
function buildUi() {
    const wrapper = document.createElement('div');
    wrapper.id = 'sal-root';
    wrapper.innerHTML = [
        '<button id="sal-open" class="sal-float" type="button" aria-expanded="false" aria-controls="sal-overlay" title="世界某处的来信">✉ <span>信箱</span></button>',
        '<div id="sal-overlay" class="sal-overlay" hidden>',
          '<div class="sal-panel" role="dialog" aria-modal="true" aria-label="世界某处的来信">',
            '<header class="sal-header"><div><small>SOMEWHERE, A LETTER</small><h2>世界某处的来信</h2></div><button id="sal-close" type="button" aria-label="关闭信箱">×</button></header>',
            '<div class="sal-content">',
              '<aside class="sal-sidebar">',
                '<label for="sal-recipient-search">收件人 / RECIPIENT</label>',
                '<div id="sal-picker" class="sal-picker">',
                  '<input id="sal-recipient-search" type="search" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" aria-controls="sal-recipient-results" autocomplete="off" placeholder="⌕ 搜索角色名称…" />',
                  '<div id="sal-recipient-results" class="sal-results" role="listbox" aria-label="收件人搜索结果" hidden></div>',
                '</div>',
                '<div id="sal-recipient-current" class="sal-current" aria-live="polite">尚未选择收件人</div>',
                '<button id="sal-new" class="sal-new" type="button">＋ 写一封新信</button>',
                '<div class="sal-sideheading"><span>往来信件</span><small id="sal-count">0 封已存信件</small></div>',
                '<div class="sal-filters"><button id="sal-filter-all" type="button" aria-pressed="true">全部</button><button id="sal-filter-starred" type="button" aria-pressed="false">★ 收藏</button></div>',
                '<div id="sal-archive" class="sal-archive" aria-label="存档信件"></div>',
                '<div class="sal-backup"><button id="sal-backup-export" type="button">↓ 备份 JSON</button><button id="sal-backup-import" type="button">↑ 恢复 JSON</button><input id="sal-backup-file" type="file" accept=".json,application/json" hidden /></div>',
              '</aside>',
              '<main class="sal-main">',
                '<form id="sal-compose">',
                  '<p class="sal-eyebrow">A LETTER TO SOMEONE, SOMEWHERE</p>',
                  '<h3>写一封信</h3>',
                  '<label for="sal-subject">主题（可选）</label>',
                  '<input id="sal-subject" maxlength="150" placeholder="今天想说的一件事…"/>',
                  '<label for="sal-signature">署名（可选，留空为匿名）</label>',
                  '<input id="sal-signature" maxlength="80" placeholder="一个陌生人"/>',
                  '<label for="sal-body">信件正文</label>',
                  '<textarea id="sal-body" rows="12" required placeholder="你好。我们可能从未见过面……"></textarea>',
                  '<p id="sal-draft-hint" class="sal-draft-hint">选择收件人后自动保存草稿</p>',
                  '<button id="sal-send" class="sal-primary" type="submit">寄出这封信</button>',
                '</form>',
                '<article id="sal-reading" hidden>',
                  '<p class="sal-eyebrow">A LETTER HAS ARRIVED</p>',
                  '<h3 id="sal-read-title"></h3>',
                  '<p id="sal-read-meta" class="sal-meta"></p>',
                  '<section><h4>寄出的信</h4><p id="sal-sign" class="sal-meta"></p><div id="sal-original" class="sal-letter"></div></section>',
                  '<section class="sal-response"><h4>收到的回信</h4><div id="sal-reply" class="sal-letter"></div></section>',
                  '<div class="sal-actions"><button id="sal-detail-star" type="button" aria-pressed="false">☆ 收藏</button><button id="sal-copy" type="button">复制回信</button><button id="sal-image" type="button">导出 PNG</button><button id="sal-delete" type="button" class="sal-danger">删除存档</button></div>',
                '</article>',
                '<p id="sal-status" class="sal-status" role="status" aria-live="polite"></p>',
              '</main>',
            '</div>',
            '<footer class="sal-footer">只读当前角色卡与主世界书 · 不使用聊天记录与历史信件 · 本地归档</footer>',
          '</div>',
        '</div>',
    ].join('');
    document.body.append(wrapper);
    el('open').addEventListener('click', () => { fillRecipients(); void refreshList(); show(); });
    el('close').addEventListener('click', hide);
    el('overlay').addEventListener('click', event => { if (event.target === el('overlay')) hide(); });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !el('overlay').hidden) {
            if (!el('recipient-results').hidden) closeRecipients();
            else hide();
        }
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !el('compose').hidden && !el('overlay').hidden) {
            el('compose').requestSubmit();
        }
    });
    el('recipient-search').addEventListener('focus', renderRecipients);
    el('recipient-search').addEventListener('input', renderRecipients);
    el('recipient-search').addEventListener('keydown', onSearchKeydown);
    document.addEventListener('pointerdown', event => {
        if (!el('picker').contains(event.target)) closeRecipients();
    });
    el('new').addEventListener('click', compose);
    el('compose').addEventListener('submit', send);
    for (const field of ['subject', 'signature', 'body']) el(field).addEventListener('input', saveCurrentDraft);
    el('filter-all').addEventListener('click', () => { state.filter = 'all'; renderArchive(); });
    el('filter-starred').addEventListener('click', () => { state.filter = 'starred'; renderArchive(); });
    el('detail-star').addEventListener('click', () => {
        if (state.current) void toggleStar(state.current.id);
    });
    el('backup-export').addEventListener('click', () => void downloadBackup());
    el('backup-import').addEventListener('click', () => el('backup-file').click());
    el('backup-file').addEventListener('change', event => void uploadBackup(event));
    el('copy').addEventListener('click', copyReply);
    el('image').addEventListener('click', saveImage);
    el('delete').addEventListener('click', () => void removeCurrent());
    fillRecipients();
    restoreCurrentDraft();
    void refreshList();
    compose();
}
function initialize() {
    if (document.getElementById('sal-root')) return;
    try { buildUi(); }
    catch (error) { console.error('[Somewhere, a Letter] 初始化失败', error); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
