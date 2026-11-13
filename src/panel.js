/**
 * Mobile mailbox layout inspired by the expanded 何曾梦觉·随身册 panel.
 *
 * Some SillyTavern mobile themes transform <html> and leave its layout height
 * at zero. In that environment a fixed element with inset:0/100dvh can center
 * outside the visible screen. Always size the backdrop explicitly from the
 * real viewport, then place the mobile panel via left/top pixel coordinates.
 */
export function attachMailboxPanel(overlay, panel, header, options = {}) {
    if (!overlay || !panel || !header) throw new Error('信箱面板初始化失败。');
    const win = options.win || window;
    const doc = options.doc || document;
    const small = () => (Number(win.innerWidth) || 0) <= 760;
    let drag = null;
    let movedByUser = false;

    function bounds() {
        const w = Math.max(230, Number(win.innerWidth) || 390);
        const innerH = Math.max(260, Number(win.innerHeight) || 700);
        const visual = win.visualViewport;
        // On iOS the visible viewport may shrink while the keyboard is shown.
        const visualH = visual?.height > 100 ? visual.height : innerH;
        const h = Math.min(innerH, visualH);
        return { w, h };
    }
    function clamp(n, low, high) {
        return Math.max(low, Math.min(Math.max(low, high), Math.round(n)));
    }
    function usableBottom(h) {
        const send = doc.getElementById('send_form');
        const top = send?.getBoundingClientRect?.().top;
        // Only use the chat-bar anchor if it really is in the lower half.
        return Number.isFinite(top) && top > h * 0.53
            ? Math.min(h - 8, top - 8)
            : h - 10;
    }
    function fit(keepDrag = false) {
        const { w, h } = bounds();
        overlay.style.left = '0px';
        overlay.style.top = '0px';
        overlay.style.right = 'auto';
        overlay.style.bottom = 'auto';
        overlay.style.width = w + 'px';
        overlay.style.height = h + 'px';

        if (!small()) {
            panel.style.removeProperty('left');
            panel.style.removeProperty('top');
            panel.style.removeProperty('width');
            panel.style.removeProperty('height');
            panel.classList.remove('sal-mobile-panel');
            movedByUser = false;
            return;
        }
        panel.classList.add('sal-mobile-panel');
        const margin = 8;
        const usable = usableBottom(h);
        const width = Math.min(580, Math.max(200, w - margin * 2));
        const height = Math.max(160, Math.min(650, h * 0.72, usable - margin));
        const oldLeft = Number.parseFloat(panel.style.left);
        const oldTop = Number.parseFloat(panel.style.top);
        const x = keepDrag && movedByUser && Number.isFinite(oldLeft)
            ? oldLeft : (w - width) / 2;
        const y = keepDrag && movedByUser && Number.isFinite(oldTop)
            ? oldTop : Math.max(margin, usable - height);
        panel.style.width = Math.round(width) + 'px';
        panel.style.height = Math.round(height) + 'px';
        panel.style.left = clamp(x, margin, w - width - margin) + 'px';
        // Keep below visible screen top and above the chat input region.
        panel.style.top = clamp(y, margin, Math.max(margin, usable - height)) + 'px';
    }
    function onDown(event) {
        if (!small() || event.isPrimary === false
            || (event.button !== undefined && event.button !== 0)
            || event.target?.closest?.('button, input, textarea, select, a')) return;
        drag = {
            id: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            left: Number.parseFloat(panel.style.left) || 0,
            top: Number.parseFloat(panel.style.top) || 0,
            moved: false,
        };
        try { header.setPointerCapture(event.pointerId); }
        catch { /* Safari may not support capture for this pointer. */ }
    }
    function onMove(event) {
        if (!drag || drag.id !== event.pointerId) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) <= 5) return;
        drag.moved = true;
        movedByUser = true;
        const { w, h } = bounds();
        const margin = 8;
        const width = Number.parseFloat(panel.style.width) || panel.offsetWidth;
        const height = Number.parseFloat(panel.style.height) || panel.offsetHeight;
        panel.style.left = clamp(drag.left + dx, margin, w - width - margin) + 'px';
        panel.style.top = clamp(drag.top + dy, margin, usableBottom(h) - height) + 'px';
        event.preventDefault?.();
    }
    function onUp(event) {
        if (!drag || drag.id !== event.pointerId) return;
        drag = null;
        try { header.releasePointerCapture(event.pointerId); }
        catch { /* Already released by browser. */ }
    }
    function onResize() {
        if (!overlay.hidden) fit(true);
    }
    header.addEventListener('pointerdown', onDown);
    header.addEventListener('pointermove', onMove);
    header.addEventListener('pointerup', onUp);
    header.addEventListener('pointercancel', onUp);
    win.addEventListener('resize', onResize);
    win.visualViewport?.addEventListener?.('resize', onResize);
    return {
        fit() { movedByUser = false; fit(false); },
        dispose() {
            header.removeEventListener('pointerdown', onDown);
            header.removeEventListener('pointermove', onMove);
            header.removeEventListener('pointerup', onUp);
            header.removeEventListener('pointercancel', onUp);
            win.removeEventListener('resize', onResize);
            win.visualViewport?.removeEventListener?.('resize', onResize);
        },
    };
}
