import { prepareReplyImages, normalizeStudioOptions, DEFAULT_STUDIO_OPTIONS, INK_PRESETS } from './export.js';
import { listFonts, importFont, deleteFont } from './font-manager.js';

const PREFS_KEY = 'somewhere-a-letter:studio:v1';

function onIOS() {
    const agent = navigator.userAgent || '';
    return /iPhone|iPad|iPod/i.test(agent)
        || (/Macintosh/i.test(agent) && navigator.maxTouchPoints > 1);
}
function canShare(files) {
    try {
        return typeof navigator.share === 'function' &&
            (typeof navigator.canShare !== 'function' || navigator.canShare({ files }));
    } catch { return false; }
}
function readOptions() {
    try { return normalizeStudioOptions(JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); }
    catch { return { ...DEFAULT_STUDIO_OPTIONS }; }
}

/**
 * A self-contained on-demand studio. Only initialized when the plugin loads;
 * no letter data or fonts are placed in model prompts or shared with a server.
 */
export function createLetterStudio({ panel }) {
    if (!panel) throw new Error('找不到信箱面板。');
    let options = readOptions();
    let letter = null;
    let files = [];
    let urls = [];
    let page = 0;
    let sequence = 0;
    let debounce = null;
    const ios = onIOS();
    const host = document.createElement('section');
    host.id = 'sal-studio';
    host.className = 'sal-studio';
    host.hidden = true;
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-label', '信纸排版工作台');
    host.innerHTML = [
        '<header class="sal-studio-header">',
          '<div><small>LETTER STUDIO</small><strong>信纸排版工作台</strong></div>',
          '<button id="sal-studio-close" type="button" aria-label="关闭排版工作台">关闭 ×</button>',
        '</header>',
        '<div class="sal-studio-content">',
          '<details id="sal-studio-controls" class="sal-studio-controls">',
            '<summary>排版选项 <span>页数 · 字体 · 字号 · 墨色</span></summary>',
            '<div class="sal-studio-fields">',
              '<label>导出页数<select id="sal-studio-pages"><option value="auto">自动分页</option><option value="1">1 页</option><option value="2">2 页</option><option value="3">3 页</option><option value="4">4 页</option><option value="5">5 页</option><option value="6">6 页</option></select></label>',
              '<label>正文字体<select id="sal-studio-font"></select></label>',
              '<div class="sal-studio-font-actions"><button id="sal-studio-import" type="button">＋ 导入字体</button><button id="sal-studio-delete" type="button" hidden>删除此字体</button><input type="file" id="sal-studio-font-file" accept=".ttf,.otf,.woff,.woff2" hidden></div>',
              '<label>正文字号<select id="sal-studio-size"><option value="24">24 px</option><option value="26">26 px</option><option value="28">28 px</option><option value="30">30 px</option><option value="32">32 px</option><option value="34">34 px</option><option value="36">36 px</option></select></label>',
              '<fieldset class="sal-studio-inks"><legend>墨色</legend><div id="sal-studio-ink-presets"></div><label>自定义颜色 <input id="sal-studio-ink" type="color" value="#302d2a"></label></fieldset>',
              '<button id="sal-studio-reset" type="button">恢复默认排版</button>',
              '<p class="sal-studio-tip">字体仅在本机使用；用户导入的字体文件存于浏览器本地，不影响原信或回信内容。</p>',
            '</div>',
          '</details>',
          '<div class="sal-studio-stage">',
            '<p id="sal-studio-notice" class="sal-studio-notice" role="status" aria-live="polite">正在准备信纸…</p>',
            '<div class="sal-studio-image-wrap"><img id="sal-studio-image" alt="回信信纸预览，iPhone 可长按保存到相册" draggable="false"></div>',
            '<div class="sal-studio-toolbar">',
              '<div class="sal-studio-pagination"><button id="sal-studio-prev" type="button">上一页</button><span id="sal-studio-count">0 / 0</span><button id="sal-studio-next" type="button">下一页</button></div>',
              '<div class="sal-studio-exports"><button id="sal-studio-save" type="button">下载全部 PNG</button><button id="sal-studio-share" type="button">分享／保存本页</button><button id="sal-studio-share-all" type="button">分享全部 PNG</button><button id="sal-studio-original" type="button">打开原图</button></div>',
            '</div>',
          '</div>',
        '</div>',
    ].join('');
    panel.append(host);
    const get = name => host.querySelector('#sal-studio-' + name);
    const inkContainer = get('ink-presets');
    for (const ink of INK_PRESETS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.title = ink.label;
        button.setAttribute('aria-label', ink.label);
        button.dataset.color = ink.color;
        button.style.backgroundColor = ink.color;
        button.addEventListener('click', () => {
            options.inkColor = ink.color;
            get('ink').value = ink.color;
            storeOptions();
            updateInkButtons();
            scheduleRender();
        });
        inkContainer.append(button);
    }
    function updateInkButtons() {
        for (const button of inkContainer.querySelectorAll('button')) {
            button.setAttribute('aria-pressed', String(button.dataset.color.toLowerCase() === options.inkColor.toLowerCase()));
        }
    }
    function storeOptions() {
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(options)); }
        catch { /* The studio still works in private browsing. */ }
    }
    function syncInputs() {
        get('pages').value = options.pages;
        get('size').value = String(options.fontSize);
        get('font').value = options.fontId;
        get('ink').value = options.inkColor;
        get('delete').hidden = !options.fontId.startsWith('custom:');
        updateInkButtons();
    }
    async function populateFonts() {
        const select = get('font');
        const choices = await listFonts();
        select.replaceChildren();
        for (const choice of choices) {
            const opt = document.createElement('option');
            opt.value = choice.id;
            opt.textContent = choice.name;
            select.append(opt);
        }
        if (!choices.some(option => option.id === options.fontId)) {
            options.fontId = 'serif';
            storeOptions();
        }
        syncInputs();
    }
    function clearPreview() {
        get('image').removeAttribute('src');
        for (const url of urls) URL.revokeObjectURL(url);
        urls = [];
        files = [];
    }
    function setNotice(value, error = false) {
        get('notice').textContent = value;
        get('notice').classList.toggle('sal-error', error);
    }
    function updatePage() {
        if (!files.length) {
            get('count').textContent = '0 / 0';
            get('image').removeAttribute('src');
            return;
        }
        page = Math.min(Math.max(0, page), files.length - 1);
        get('image').src = urls[page];
        get('count').textContent = (page + 1) + ' / ' + files.length;
        get('prev').disabled = page === 0;
        get('next').disabled = page >= files.length - 1;
        get('share').disabled = !canShare([files[page]]);
        get('share-all').hidden = !ios || files.length < 2;
        get('share-all').disabled = !canShare(files);
        get('save').hidden = ios;
        get('share').hidden = !ios;
        get('original').hidden = !ios;
    }
    async function render() {
        if (!letter || host.hidden) return;
        const id = ++sequence;
        const savedPage = page;
        setNotice('正在按当前样式排版…');
        try {
            const prepared = await prepareReplyImages(letter, options);
            if (id !== sequence || host.hidden) return;
            const nextUrls = prepared.map(file => URL.createObjectURL(file));
            clearPreview();
            files = prepared;
            urls = nextUrls;
            page = Math.min(savedPage, prepared.length - 1);
            updatePage();
            const requested = options.pages !== 'auto' ? Number(options.pages) : 0;
            const note = requested && requested !== files.length
                ? '内容不足以填满 ' + requested + ' 页，因此只生成 ' + files.length + ' 页。'
                : '预览与导出共用相同排版。';
            setNotice('共 ' + files.length + ' 页。' + note + (ios ? ' 长按图像可保存到相册。' : ''));
        } catch (error) {
            if (id !== sequence || host.hidden) return;
            clearPreview();
            get('count').textContent = '0 / 0';
            setNotice(error?.message || String(error), true);
        }
    }
    function scheduleRender() {
        // Invalidate any earlier in-flight preview immediately.
        sequence++;
        clearTimeout(debounce);
        debounce = setTimeout(() => { debounce = null; void render(); }, 180);
    }
    async function open(nextLetter) {
        if (!nextLetter) return;
        const opening = ++sequence;
        letter = nextLetter;
        page = 0;
        host.hidden = false;
        get('controls').open = window.innerWidth > 760;
        setNotice('正在读取字体并排版…');
        try {
            await populateFonts();
            if (!letter || host.hidden || opening !== sequence) return;
            await render();
        } catch (error) {
            setNotice('信纸工作台初始化失败：' + (error?.message || String(error)), true);
        }
    }
    function close() {
        sequence++;
        clearTimeout(debounce);
        debounce = null;
        host.hidden = true;
        letter = null;
        clearPreview();
        get('count').textContent = '0 / 0';
    }
    async function nativeShare(all) {
        const selected = all ? files : [files[page]];
        if (!selected.length || !canShare(selected)) {
            setNotice('当前设备不支持该文件分享方式，请长按图片或打开原图。', true);
            return;
        }
        try {
            // Invoked directly by a real button click; files were rendered earlier.
            await navigator.share({ files: selected, title: 'Somewhere, a Letter' });
            setNotice('系统分享菜单已关闭，请到相册或文件 App 确认是否保存成功。');
        } catch (error) {
            if (error?.name !== 'AbortError') setNotice('分享失败：' + (error.message || String(error)), true);
        }
    }
    function openOriginal() {
        if (!urls[page]) return;
        const opened = window.open(urls[page], '_blank');
        if (opened) opened.opener = null;
        else setNotice('浏览器拦截了新窗口，请长按预览图片保存。', true);
    }
    async function downloadAll() {
        if (!letter || !files.length) return;
        // Reuse exactly the prepared preview Files (avoid a second reflow).
        for (const file of files) {
            const url = URL.createObjectURL(file);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = file.name;
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            if (files.length > 1) await new Promise(resolve => setTimeout(resolve, 180));
        }
        setNotice('已向浏览器请求下载 ' + files.length + ' 页 PNG，请查看下载记录。');
    }
    function updateOption(name, value) {
        options = normalizeStudioOptions({ ...options, [name]: value });
        storeOptions();
        syncInputs();
        scheduleRender();
    }
    get('pages').addEventListener('change', () => updateOption('pages', get('pages').value));
    get('size').addEventListener('change', () => updateOption('fontSize', get('size').value));
    get('font').addEventListener('change', () => updateOption('fontId', get('font').value));
    get('ink').addEventListener('input', () => updateOption('inkColor', get('ink').value));
    get('reset').addEventListener('click', () => {
        options = { ...DEFAULT_STUDIO_OPTIONS };
        storeOptions();
        void populateFonts().then(scheduleRender);
    });
    get('import').addEventListener('click', () => get('font-file').click());
    get('font-file').addEventListener('change', async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            const result = await importFont(file);
            options.fontId = result.id;
            storeOptions();
            await populateFonts();
            scheduleRender();
            setNotice('字体「' + result.name + '」已导入本机，正在更新预览。');
        } catch (error) { setNotice(error?.message || String(error), true); }
    });
    get('delete').addEventListener('click', async () => {
        if (!options.fontId.startsWith('custom:')) return;
        if (!window.confirm('删除此设备保存的字体？之前导出的 PNG 不会受影响。')) return;
        try {
            await deleteFont(options.fontId);
            options.fontId = 'serif';
            storeOptions();
            await populateFonts();
            scheduleRender();
        } catch (error) { setNotice(error?.message || String(error), true); }
    });
    get('close').addEventListener('click', close);
    get('prev').addEventListener('click', () => { page--; updatePage(); });
    get('next').addEventListener('click', () => { page++; updatePage(); });
    get('share').addEventListener('click', () => { void nativeShare(false); });
    get('share-all').addEventListener('click', () => { void nativeShare(true); });
    get('original').addEventListener('click', openOriginal);
    get('save').addEventListener('click', () => { void downloadAll(); });
    return {
        open,
        close,
        get visible() { return !host.hidden; },
    };
}
