/**
 * Mobile mailbox panel — iOS keyboard / visual viewport compatibility.
 *
 * SillyTavern can transform its document root. On iOS, focusing an input can
 * pan the visual viewport even if the layout viewport and scrollTop stay
 * unchanged. We keep the mailbox aligned with the ACTUAL visible viewport,
 * including its offset, without scrolling or blurring the focused input.
 *
 * PC keeps the original centered modal. Mobile keeps the pocket-book panel.
 */
export function attachMailboxPanel(overlay, panel, header, options = {}) {
    if (!overlay || !panel || !header) throw new Error('信箱面板初始化失败。');

    const win = options.win || window;
    const doc = options.doc || document;
    const root = options.root || panel.closest?.('#sal-root');
    const small = () => (Number(win.innerWidth) || 0) <= 760;
    const editable = target => Boolean(target && panel.contains?.(target) &&
        (target.matches?.('input:not([type="hidden"]):not([type="checkbox"]), textarea, [contenteditable="true"]')));
    let drag = null;
    let movedByUser = false;
    let keyboardFocus = false;
    let frame = 0;
    let settleTimer = 0;

    function clamp(value, low, high) {
        return Math.max(low, Math.min(Math.max(low, high), Math.round(value)));
    }
    function viewport() {
        const visual = win.visualViewport;
        const innerWidth = Math.max(230, Number(win.innerWidth) || 390);
        const innerHeight = Math.max(180, Number(win.innerHeight) || 700);
        return {
            width: clamp(Number(visual?.width) || innerWidth, 200, innerWidth),
            height: clamp(Number(visual?.height) || innerHeight, 150, innerHeight),
            offsetLeft: Number(visual?.offsetLeft) || 0,
            offsetTop: Number(visual?.offsetTop) || 0,
            innerHeight,
        };
    }
    function usableBottom(v, editing) {
        if (editing) return v.height - 8;
        const send = doc.getElementById('send_form');
        const screenTop = send?.getBoundingClientRect?.().top;
        const withinVisual = screenTop - v.offsetTop;
        return Number.isFinite(withinVisual) && withinVisual > v.height * .53
            ? Math.min(v.height - 8, withinVisual - 8)
            : v.height - 10;
    }
    function alignToVisualViewport(v) {
        overlay.style.left = v.offsetLeft + 'px';
        overlay.style.top = v.offsetTop + 'px';
        overlay.style.right = 'auto';
        overlay.style.bottom = 'auto';
        overlay.style.width = v.width + 'px';
        overlay.style.height = v.height + 'px';

        // iOS may pan the whole document on focus. Fixed descendants under a
        // transformed root then inherit the pan. Measure the real rectangle
        // and compensate instead of assuming CSS fixed top:0 means visible.
        const actual = overlay.getBoundingClientRect?.();
        if (actual && Number.isFinite(actual.left) && Number.isFinite(actual.top)) {
            const dx = v.offsetLeft - actual.left;
            const dy = v.offsetTop - actual.top;
            if (Math.abs(dx) > 1 && Math.abs(dx) < v.innerHeight * 3) {
                overlay.style.left = Math.round(v.offsetLeft + dx) + 'px';
            }
            if (Math.abs(dy) > 1 && Math.abs(dy) < v.innerHeight * 3) {
                overlay.style.top = Math.round(v.offsetTop + dy) + 'px';
            }
        }
    }
    function ensureInputVisible() {
        const input = doc.activeElement;
        if (!editable(input)) return;
        const container = input.closest?.('.sal-main, .sal-sidebar');
        if (!container || typeof container.scrollTop !== 'number') return;
        const fieldRect = input.getBoundingClientRect?.();
        const areaRect = container.getBoundingClientRect?.();
        if (!fieldRect || !areaRect) return;
        const pad = 12;
        const bottom = Math.min(areaRect.bottom, viewport().offsetTop + viewport().height) - pad;
        if (fieldRect.bottom > bottom) container.scrollTop += fieldRect.bottom - bottom;
        else if (fieldRect.top < areaRect.top + pad) container.scrollTop -= areaRect.top + pad - fieldRect.top;
    }
    function fit(keepDrag = false) {
        const v = viewport();
        // DOM focus may arrive before visualViewport changes; pre-position
        // near the top to avoid Safari's predictive scroll jumping.
        const editing = small() && (keyboardFocus || editable(doc.activeElement));
        if (root) root.dataset.keyboard = editing ? 'true' : 'false';

        alignToVisualViewport(v);
        if (!small()) {
            for (const property of ['left', 'top', 'width', 'height']) {
                panel.style.removeProperty(property);
            }
            panel.classList.remove('sal-mobile-panel');
            movedByUser = false;
            return;
        }

        panel.classList.add('sal-mobile-panel');
        const margin = 8;
        const width = Math.min(580, Math.max(200, v.width - margin * 2));
        const bottom = usableBottom(v, editing);
        const limit = Math.max(130, bottom - margin);
        const height = editing
            ? Math.min(limit, Math.max(150, v.height - margin * 2))
            : Math.min(limit, 650, Math.max(160, v.height * .72));
        const oldX = Number.parseFloat(panel.style.left);
        const oldY = Number.parseFloat(panel.style.top);
        const x = keepDrag && movedByUser && !editing && Number.isFinite(oldX) ? oldX : (v.width - width) / 2;
        const y = editing ? margin
            : keepDrag && movedByUser && Number.isFinite(oldY) ? oldY
                : Math.max(margin, bottom - height);
        panel.style.width = Math.round(width) + 'px';
        panel.style.height = Math.round(height) + 'px';
        panel.style.left = clamp(x, margin, v.width - width - margin) + 'px';
        panel.style.top = clamp(y, margin, Math.max(margin, bottom - height)) + 'px';

        if (editing) ensureInputVisible();
    }
    function scheduleFit() {
        if (overlay.hidden) return;
        if (frame) win.cancelAnimationFrame?.(frame);
        if (typeof win.requestAnimationFrame === 'function') {
            frame = win.requestAnimationFrame(() => { frame = 0; fit(true); });
        } else {
            fit(true);
        }
    }
    function focusIn(event) {
        if (!editable(event.target) || !small()) return;
        keyboardFocus = true;
        fit(true);
        // iOS keyboard opening animates after focus; a second fit aligns the
        // panel after visualViewport is updated without touching input focus.
        scheduleFit();
    }
    function focusOut(event) {
        if (!editable(event.target)) return;
        keyboardFocus = false;
        // If focus moved to another field, focusin will re-enable editing.
        scheduleFit();
    }
    function onDown(event) {
        if (!small() || keyboardFocus || event.isPrimary === false
            || (event.button !== undefined && event.button !== 0)
            || event.target?.closest?.('button, input, textarea, select, a')) return;
        drag = {
            id: event.pointerId,
            startX: event.clientX, startY: event.clientY,
            left: Number.parseFloat(panel.style.left) || 0,
            top: Number.parseFloat(panel.style.top) || 0,
            moved: false,
        };
        try { header.setPointerCapture(event.pointerId); } catch { /* Optional. */ }
    }
    function onMove(event) {
        if (!drag || drag.id !== event.pointerId) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) <= 5) return;
        drag.moved = true;
        movedByUser = true;
        const v = viewport(), margin = 8;
        const width = Number.parseFloat(panel.style.width) || panel.offsetWidth;
        const height = Number.parseFloat(panel.style.height) || panel.offsetHeight;
        panel.style.left = clamp(drag.left + dx, margin, v.width - width - margin) + 'px';
        panel.style.top = clamp(drag.top + dy, margin, usableBottom(v, false) - height) + 'px';
        event.preventDefault?.();
    }
    function onUp(event) {
        if (!drag || drag.id !== event.pointerId) return;
        drag = null;
        try { header.releasePointerCapture(event.pointerId); } catch { /* Optional. */ }
    }
    function onResizeOrScroll() {
        scheduleFit();
    }
    header.addEventListener('pointerdown', onDown);
    header.addEventListener('pointermove', onMove);
    header.addEventListener('pointerup', onUp);
    header.addEventListener('pointercancel', onUp);
    panel.addEventListener('focusin', focusIn);
    panel.addEventListener('focusout', focusOut);
    win.addEventListener('resize', onResizeOrScroll);
    win.addEventListener('scroll', onResizeOrScroll, { passive: true });
    win.visualViewport?.addEventListener?.('resize', onResizeOrScroll);
    win.visualViewport?.addEventListener?.('scroll', onResizeOrScroll);

    return {
        fit() { movedByUser = false; keyboardFocus = editable(doc.activeElement); fit(false); },
        dispose() {
            if (frame) win.cancelAnimationFrame?.(frame);
            if (settleTimer) win.clearTimeout?.(settleTimer);
            header.removeEventListener('pointerdown', onDown);
            header.removeEventListener('pointermove', onMove);
            header.removeEventListener('pointerup', onUp);
            header.removeEventListener('pointercancel', onUp);
            panel.removeEventListener('focusin', focusIn);
            panel.removeEventListener('focusout', focusOut);
            win.removeEventListener('resize', onResizeOrScroll);
            win.removeEventListener('scroll', onResizeOrScroll);
            win.visualViewport?.removeEventListener?.('resize', onResizeOrScroll);
            win.visualViewport?.removeEventListener?.('scroll', onResizeOrScroll);
        },
    };
}
