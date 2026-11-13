// Lightweight Canvas export; no font bundles, canvas libraries or external network calls.
const W = 1080;
const H = 1440;
const MARGIN = 104;
const LINE_HEIGHT = 53;
const PAGE_LINES = 19;

function breakText(ctx, text, width) {
    const lines = [];
    const paragraphs = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    for (const paragraph of paragraphs) {
        if (!paragraph) { lines.push(''); continue; }
        const tokens = paragraph.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*|\s+|./gu) || [];
        let current = '';
        for (const token of tokens) {
            if (ctx.measureText(current + token).width <= width) {
                current += token;
                continue;
            }
            if (current.trim()) { lines.push(current.trimEnd()); current = ''; }
            if (/^\s+$/u.test(token)) continue;
            // Only split words if they exceed the full width.
            let rest = token;
            while (ctx.measureText(rest).width > width) {
                let piece = '';
                for (const char of Array.from(rest)) {
                    if (ctx.measureText(piece + char).width > width) break;
                    piece += char;
                }
                if (!piece) break;
                lines.push(piece);
                rest = rest.slice(piece.length);
            }
            current = rest;
        }
        lines.push(current.trimEnd());
    }
    return lines;
}

function drawPage(letter, lines, index, count) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前浏览器无法创建图片画布。');
    ctx.fillStyle = '#f6f2e8'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#292a27'; ctx.textBaseline = 'top';
    ctx.font = '26px Georgia, serif';
    ctx.fillText('SOMEWHERE, A LETTER', MARGIN, 75);
    ctx.strokeStyle = '#cec6b7'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(MARGIN, 132); ctx.lineTo(W - MARGIN, 132); ctx.stroke();
    ctx.font = 'bold 42px "Songti SC", "Noto Serif CJK SC", serif';
    const heading = '回信 · ' + (letter.title || '无题');
    let title = heading;
    while (ctx.measureText(title).width > W - MARGIN * 2 && title.length > 2) title = title.slice(0, -2) + '…';
    ctx.fillText(title, MARGIN, 177);
    ctx.fillStyle = '#766d5f';
    ctx.font = '23px "Noto Sans CJK SC", sans-serif';
    ctx.fillText('FROM  ' + String(letter.characterName || '').slice(0, 36), MARGIN, 243);
    ctx.textAlign = 'right';
    ctx.fillText(String(letter.createdAt || '').slice(0, 10), W - MARGIN, 243);
    ctx.textAlign = 'left';
    ctx.font = '32px "Songti SC", "Noto Serif CJK SC", "SimSun", serif';
    ctx.fillStyle = '#302d2a';
    for (let j = 0; j < lines.length; j++) ctx.fillText(lines[j], MARGIN, 308 + j * LINE_HEIGHT);
    ctx.fillStyle = '#8f8474'; ctx.font = '22px Georgia, serif';
    ctx.fillText('A LETTER FROM ANOTHER WORLD', MARGIN, 1350);
    ctx.textAlign = 'right'; ctx.fillText((index + 1) + ' / ' + count, W - MARGIN, 1350);
    return canvas;
}

export function exportAsPng(letter) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前浏览器不支持图片导出。');
    ctx.font = '32px "Songti SC", "Noto Serif CJK SC", "SimSun", serif';
    const lines = breakText(ctx, letter.reply, W - MARGIN * 2);
    const pages = Math.max(1, Math.ceil(lines.length / PAGE_LINES));
    if (pages > 25) throw new Error('回信超过25页，请先复制文字保存。');
    for (let i = 0; i < pages; i++) {
        const image = drawPage(letter, lines.slice(i * PAGE_LINES, (i + 1) * PAGE_LINES), i, pages);
        const a = document.createElement('a');
        a.href = image.toDataURL('image/png');
        a.download = 'Somewhere-a-Letter-' + letter.id + (pages > 1 ? '-p' + (i + 1) : '') + '.png';
        document.body.append(a); a.click(); a.remove();
    }
    return pages;
}
