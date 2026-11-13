import { recipients, generateLetter } from './src/engine.js';
import { saveLetter, listLetters, deleteLetter } from './src/storage.js';
import { exportAsPng } from './src/export.js';

const PREFIX = 'sal';
let state = { selected: '', items: [], current: null, busy: false, request: 0 };

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
    return el('recipient').selectedOptions[0]?.textContent || '角色';
}
function setBusy(value) {
    state.busy = value;
    el('send').disabled = value;
    el('send').textContent = value ? '正在等待回信…' : '寄出这封信';
    el('recipient').disabled = value;
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
function fillRecipients() {
    const current = state.selected;
    const list = recipients(context());
    const select = el('recipient');
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = list.length ? '选择收件人…' : '还没有可用角色';
    select.append(placeholder);
    for (const item of list) {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name;
        select.append(option);
    }
    state.selected = list.some(r => r.id === current) ? current : (list[0]?.id || '');
    select.value = state.selected;
}
async function refreshList() {
    const thisRequest = ++state.request;
    const list = el('archive');
    list.replaceChildren();
    if (!state.selected) {
        status('请先在酒馆中创建或导入角色卡。', true);
        return;
    }
    try {
        const items = await listLetters(state.selected);
        if (thisRequest !== state.request) return;
        state.items = items;
        const count = el('count');
        count.textContent = items.length + ' 封已存信件';
        if (!items.length) {
            const empty = document.createElement('p');
            empty.className = 'sal-empty';
            empty.textContent = '还没有往来的信。';
            list.append(empty);
        }
        for (const item of items) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'sal-item';
            button.dataset.id = item.id;
            const title = document.createElement('strong');
            title.textContent = item.title || '无题来信';
            const date = document.createElement('small');
            date.textContent = new Date(item.createdAt).toLocaleDateString();
            button.append(title, date);
            button.addEventListener('click', () => read(item));
            list.append(button);
        }
    } catch (error) {
        status(error.message || '读取本地信件失败。', true);
    }
}
function read(letter) {
    state.current = letter;
    el('read-title').textContent = letter.title || '一封无题的信';
    el('read-meta').textContent = '致 ' + letter.characterName + ' · ' + new Date(letter.createdAt).toLocaleString();
    el('original').textContent = letter.body;
    el('reply').textContent = letter.reply;
    el('sign').textContent = letter.signature ? '署名：' + letter.signature : '匿名来信';
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
        try {
            await saveLetter(letter);
            await refreshList();
            status('回信已送达并保存在这个浏览器中。');
        } catch (saveError) {
            status('回信已经生成，但本地保存失败：' + saveError.message + '。请立即复制或导出。', true);
        }
        read(letter);
        el('subject').value = '';
        el('body').value = '';
        el('signature').value = '';
        if (el('status').classList.contains('sal-error') === false) {
            status('回信已送达。旧信不会被用于下一次生成。');
        }
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
                '<label for="sal-recipient">收件人 / RECIPIENT</label>',
                '<select id="sal-recipient"></select>',
                '<button id="sal-new" class="sal-new" type="button">＋ 写一封新信</button>',
                '<div class="sal-sideheading"><span>往来信件</span><small id="sal-count">0 封已存信件</small></div>',
                '<div id="sal-archive" class="sal-archive" aria-label="存档信件"></div>',
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
                  '<button id="sal-send" class="sal-primary" type="submit">寄出这封信</button>',
                '</form>',
                '<article id="sal-reading" hidden>',
                  '<p class="sal-eyebrow">A LETTER HAS ARRIVED</p>',
                  '<h3 id="sal-read-title"></h3>',
                  '<p id="sal-read-meta" class="sal-meta"></p>',
                  '<section><h4>寄出的信</h4><p id="sal-sign" class="sal-meta"></p><div id="sal-original" class="sal-letter"></div></section>',
                  '<section class="sal-response"><h4>收到的回信</h4><div id="sal-reply" class="sal-letter"></div></section>',
                  '<div class="sal-actions"><button id="sal-copy" type="button">复制回信</button><button id="sal-image" type="button">导出 PNG</button><button id="sal-delete" type="button" class="sal-danger">删除存档</button></div>',
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
        if (event.key === 'Escape' && !el('overlay').hidden) hide();
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !el('compose').hidden && !el('overlay').hidden) {
            el('compose').requestSubmit();
        }
    });
    el('recipient').addEventListener('change', () => {
        state.selected = el('recipient').value;
        compose();
        void refreshList();
    });
    el('new').addEventListener('click', compose);
    el('compose').addEventListener('submit', send);
    el('copy').addEventListener('click', copyReply);
    el('image').addEventListener('click', saveImage);
    el('delete').addEventListener('click', () => void removeCurrent());
    fillRecipients();
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
