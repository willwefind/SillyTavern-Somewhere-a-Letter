/**
 * Optional local fonts for Letter Studio. No bundled font files.
 * Imported binaries live in a separate IndexedDB, not in the letter store,
 * not in the JSON letter backup, and are never sent to the model API.
 */
const DB = 'somewhere-a-letter-fonts';
const STORE = 'fonts';
const MAX_FONT_BYTES = 12 * 1024 * 1024;
const MAX_FONTS = 12;
const loaded = new Set();
let database;
const fonts = [
    { id: 'serif', name: '系统宋体', stack: '"Songti SC","STSong","Noto Serif CJK SC","SimSun",serif', available: true },
    { id: 'sans', name: '系统黑体', stack: '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif', available: true },
    { id: 'kai', name: '楷体', family: 'Kaiti SC', stack: '"Kaiti SC","STKaiti","KaiTi",serif' },
    { id: 'pingfang', name: '苹方', family: 'PingFang SC', stack: '"PingFang SC",sans-serif' },
    { id: 'noto', name: '思源宋体', family: 'Noto Serif CJK SC', stack: '"Noto Serif CJK SC",serif' },
    { id: 'georgia', name: 'Georgia / 西文', family: 'Georgia', stack: 'Georgia,"Songti SC",serif' },
];

function openDB() {
    if (database) return database;
    database = new Promise((resolve, reject) => {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => {
            if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' });
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error || new Error('字体存储不可用。'));
    }).catch(error => { database = null; throw error; });
    return database;
}
async function transaction(mode, callback) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = callback(tx.objectStore(STORE));
        let value;
        req.onsuccess = () => { value = req.result; };
        tx.oncomplete = () => resolve(value);
        tx.onerror = () => reject(tx.error || req.error || new Error('字体存储失败。'));
        tx.onabort = () => reject(tx.error || new Error('字体操作已取消。'));
    });
}
function hasFont(family) {
    // Browser FontFaceSet.check may return true for an unknown family.
    // Compare two distinct fallbacks using Chinese + Latin glyph samples.
    try {
        const ctx = document.createElement('canvas').getContext('2d');
        const sample = '天地玄黄永日AWQil09@';
        const size = '66px ';
        const base = [];
        for (const fallback of ['monospace', 'serif']) {
            ctx.font = size + fallback;
            base.push(ctx.measureText(sample).width);
            ctx.font = size + '"' + family.replace(/["\\]/g, '') + '",' + fallback;
            if (Math.abs(ctx.measureText(sample).width - base.at(-1)) > 0.75) return true;
        }
    } catch { /* Always provide the default generic stacks. */ }
    return false;
}
export async function listFonts() {
    const installed = fonts.filter(f => f.available || (f.family && hasFont(f.family)))
        .map(f => ({ id: f.id, name: f.name }));
    let userFonts = [];
    try {
        userFonts = (await transaction('readonly', store => store.getAll()))
            .map(f => ({ id: f.id, name: f.name + ' · 已导入' }));
    } catch { /* Font imports remain optional. */ }
    return [...installed, ...userFonts];
}
function builtin(id) { return fonts.find(f => f.id === id); }
export async function getFontStack(id) {
    const preset = builtin(id);
    if (preset) return preset.stack;
    if (!/^custom:[a-zA-Z0-9_-]{1,100}$/.test(String(id))) return fonts[0].stack;
    const saved = await transaction('readonly', store => store.get(id));
    if (!saved) throw new Error('这款导入字体已不存在，请重新选择。');
    const family = 'SALFont_' + id.slice(7);
    if (!loaded.has(id)) {
        const face = new FontFace(family, saved.bytes);
        await face.load();
        document.fonts.add(face);
        loaded.add(id);
    }
    return '"' + family + '",' + fonts[0].stack;
}
export async function importFont(file) {
    if (!file || !/\.(ttf|otf|woff2?)$/i.test(file.name))
        throw new Error('请选择 .ttf、.otf、.woff 或 .woff2 字体文件。');
    if (file.size < 128 || file.size > MAX_FONT_BYTES)
        throw new Error('单个字体文件需小于 12 MB。');
    const current = await transaction('readonly', store => store.getAll());
    if (current.length >= MAX_FONTS) throw new Error('最多导入 12 款字体，请先删除不再使用的字体。');
    const suffix = globalThis.crypto?.randomUUID?.().replace(/-/g, '') ||
        Date.now().toString(36) + Math.random().toString(36).slice(2);
    const id = 'custom:' + suffix;
    const bytes = await file.arrayBuffer();
    // Validate font decoding before persisting the binary.
    const family = 'SALFont_' + suffix;
    let face;
    try {
        face = new FontFace(family, bytes);
        await face.load();
    } catch {
        throw new Error('字体加载失败，请确认文件格式有效且字体没有损坏。');
    }
    const name = file.name.replace(/\.(ttf|otf|woff2?)$/i, '').slice(0, 80);
    await transaction('readwrite', store => store.add({ id, name, bytes }));
    document.fonts.add(face);
    loaded.add(id);
    return { id, name };
}
export async function deleteFont(id) {
    if (!String(id).startsWith('custom:')) return;
    await transaction('readwrite', store => store.delete(id));
    const family = 'SALFont_' + id.slice(7);
    for (const face of document.fonts) if (face.family === family) document.fonts.delete(face);
    loaded.delete(id);
}
