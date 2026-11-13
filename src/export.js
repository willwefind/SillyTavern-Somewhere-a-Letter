import { getFontStack } from './font-manager.js';

/**
 * Letter Studio rendering. Adapted from the user's Shiju workflow:
 * kinsoku-aware wrapping, English whole-word wrapping and balanced page
 * groups. Preview and the exported File objects use this exact renderer.
 *
 * No Shiju UI / font files or external dependencies are bundled.
 */
const W = 1080;
const BASE_H = 1440;
const MAX_H = 4096; // Keep individual PNG pages viable on mobile Safari.
const PAD = 104;
const BODY_TOP = 302;
const FOOTER_SPACE = 145;
const MAX_PAGES = 25;
const NO_START = '，。、；：？！）》」』】〉…—·%,.;:?!”’';
const NO_END = '（《「『【〈“‘';
export const DEFAULT_STUDIO_OPTIONS = Object.freeze({
    pages: 'auto', fontId: 'serif', fontSize: 30, inkColor: '#302d2a',
});
export const INK_PRESETS = Object.freeze([
    { id: 'black', label: '墨黑', color: '#302d2a' },
    { id: 'brown', label: '暖棕', color: '#77543c' },
    { id: 'grey', label: '深灰', color: '#55585b' },
    { id: 'blue', label: '深蓝', color: '#314960' },
    { id: 'red', label: '暗红', color: '#824548' },
]);
export function normalizeStudioOptions(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const number = Number(source.pages);
    const pages = source.pages === 'auto' || !Number.isInteger(number) || number < 1 || number > 6
        ? 'auto' : String(number);
    const size = Number(source.fontSize);
    return {
        pages,
        fontId: typeof source.fontId === 'string' && source.fontId.length < 128
            ? source.fontId : DEFAULT_STUDIO_OPTIONS.fontId,
        fontSize: Number.isFinite(size) ? Math.min(36, Math.max(24, Math.round(size / 2) * 2)) : 30,
        inkColor: typeof source.inkColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(source.inkColor)
            ? source.inkColor : DEFAULT_STUDIO_OPTIONS.inkColor,
    };
}
function textTokens(line) {
    // Chinese glyphs individually, Latin runs together: never split English
    // words unless a single word is wider than the entire writing area.
    return line.match(/[A-Za-z0-9][A-Za-z0-9\-_.@/+']*|\s+|[\s\S]/gu) || [];
}
function wrapLine(ctx, text, width) {
    // Adapted from Shiju's wrap(): opening punctuation must not end a line,
    // and closing punctuation must not begin the next line.
    const result = [];
    let current = '';
    for (let token of textTokens(text)) {
        if (current && ctx.measureText(current + token).width > width) {
            while (current && NO_END.includes(current.at(-1))) {
                token = current.at(-1) + token;
                current = current.slice(0, -1);
            }
            if (current) result.push(current.trimEnd());
            current = '';
        }
        if (!current && NO_START.includes(token[0]) && result.length) {
            const last = result.length - 1;
            const prev = result[last];
            if (ctx.measureText(prev + token).width <= width) {
                result[last] = prev + token;
                continue;
            }
            if (prev.length > 1) {
                // Move a glyph together with any trailing close punctuation.
                // Moving only one punctuation character can still leave a
                // Chinese full stop at the start of the following line.
                let remaining = prev;
                let moved = '';
                do {
                    moved = remaining.at(-1) + moved;
                    remaining = remaining.slice(0, -1);
                } while (remaining.length > 1 && NO_START.includes(moved[0]));
                result[last] = remaining;
                current = moved;
            }
        }
        if (!current && /^\s+$/u.test(token)) continue;
        // Split a word only if the whole word itself exceeds page width.
        if (!current && ctx.measureText(token).width > width) {
            while (ctx.measureText(token).width > width) {
                let piece = '';
                for (const glyph of Array.from(token)) {
                    if (piece && ctx.measureText(piece + glyph).width > width) break;
                    piece += glyph;
                }
                if (!piece) break;
                result.push(piece);
                token = token.slice(piece.length);
            }
        }
        current += token;
    }
    result.push(current.trimEnd());
    return result;
}
function makeItems(ctx, text, fontSize, fontStack) {
    ctx.font = fontSize + 'px ' + fontStack;
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const items = [];
    const maxWidth = W - PAD * 2;
    for (const part of lines) {
        if (!part) { items.push(''); continue; }
        items.push(...wrapLine(ctx, part, maxWidth));
    }
    return items.length ? items : [''];
}
function paginate(items, count, lineHeight) {
    if (!count) {
        const cap = Math.max(1, Math.floor((BASE_H - BODY_TOP - FOOTER_SPACE) / lineHeight));
        const pages = [];
        for (let i = 0; i < items.length; i += cap) pages.push(items.slice(i, i + cap));
        return pages;
    }
    // Even distribution: each page takes a fair number of wrapped lines.
    // Never insert blank pages merely to satisfy a requested page count.
    const actualCount = Math.min(count, Math.max(1, items.length));
    const pages = [];
    let index = 0;
    for (let p = 0; p < actualCount; p++) {
        const take = Math.ceil((items.length - index) / (actualCount - p));
        pages.push(items.slice(index, index + take));
        index += take;
    }
    return pages;
}
export async function planLetterPages(letter, settings = {}) {
    const opts = normalizeStudioOptions(settings);
    const fontStack = await getFontStack(opts.fontId);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前浏览器无法排版 PNG。');
    const lineHeight = Math.round(opts.fontSize * 1.7);
    const items = makeItems(ctx, letter.reply, opts.fontSize, fontStack);
    const wanted = opts.pages === 'auto' ? 0 : Number(opts.pages);
    const pages = paginate(items, wanted, lineHeight);
    if (pages.length > MAX_PAGES) {
        throw new Error('自动分页超过 25 页，请调小字号，或先复制保存文字。');
    }
    const usedHeight = Math.max(...pages.map(lines => lines.length * lineHeight));
    const height = Math.max(BASE_H, BODY_TOP + usedHeight + FOOTER_SPACE);
    if (height > MAX_H) {
        throw new Error('指定页数下信纸太长，iPhone 可能无法保存。请增加页数或调小字号。');
    }
    return { pages, height, width: W, opts, fontStack, lineHeight };
}
function localDate(iso) {
    const date = new Date(iso);
    return Number.isFinite(date.getTime())
        ? [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')].join('-') : '';
}
function drawPage(letter, plan, index) {
    const c = document.createElement('canvas');
    c.width = plan.width;
    c.height = plan.height;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('无法创建信纸画布。');
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#f7f3e9';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = plan.opts.inkColor;
    ctx.font = '26px Georgia,serif';
    ctx.fillText('SOMEWHERE, A LETTER', PAD, 78);
    ctx.strokeStyle = '#cdc3b2';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(PAD, 134); ctx.lineTo(W - PAD, 134); ctx.stroke();

    ctx.font = 'bold 41px ' + plan.fontStack;
    const subject = '回信 · ' + (letter.title || '无题');
    let title = subject;
    while (title.length > 2 && ctx.measureText(title).width > W - PAD * 2) {
        title = title.slice(0, -2) + '…';
    }
    ctx.fillText(title, PAD, 176);
    ctx.font = '23px ' + plan.fontStack;
    ctx.globalAlpha = .78;
    ctx.fillText('FROM  ' + String(letter.characterName || '').slice(0, 40), PAD, 245);
    ctx.textAlign = 'right';
    ctx.fillText(localDate(letter.createdAt), W - PAD, 245);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;

    ctx.font = plan.opts.fontSize + 'px ' + plan.fontStack;
    let y = BODY_TOP;
    for (const line of plan.pages[index]) {
        if (line) ctx.fillText(line, PAD, y);
        y += plan.lineHeight;
    }

    ctx.globalAlpha = .65;
    ctx.font = '22px Georgia,serif';
    ctx.fillText('A LETTER FROM ANOTHER WORLD', PAD, plan.height - 84);
    ctx.textAlign = 'right';
    ctx.fillText((index + 1) + ' / ' + plan.pages.length, W - PAD, plan.height - 84);
    ctx.globalAlpha = 1;
    return c;
}
export async function prepareReplyImages(letter, settings = {}) {
    const plan = await planLetterPages(letter, settings);
    const files = [];
    const safeId = String(letter.id || 'letter').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
    for (let i = 0; i < plan.pages.length; i++) {
        const canvas = drawPage(letter, plan, i);
        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(value => value ? resolve(value)
                : reject(new Error('第 ' + (i + 1) + ' 页无法生成 PNG。')), 'image/png');
        });
        const suffix = plan.pages.length > 1 ? '-p' + (i + 1) : '';
        files.push(new File([blob], 'Somewhere-a-Letter-' + safeId + suffix + '.png', {
            type: 'image/png', lastModified: Date.now(),
        }));
    }
    return files;
}
export async function exportAsPng(letter, settings = {}) {
    const files = await prepareReplyImages(letter, settings);
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
    return files.length;
}
