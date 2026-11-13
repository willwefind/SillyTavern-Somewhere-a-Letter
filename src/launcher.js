/**
 * Draggable letter seal used to open the mailbox.
 *
 * Positioning is deliberately based on explicit left/top pixel coordinates,
 * rather than right/bottom. On some SillyTavern mobile themes the <html>
 * element is transformed, which can push bottom-anchored fixed UI offscreen.
 *
 * Interaction: short tap = open; move > 5 px = drag; release = save position.
 * Inspired by the positioning logic of 何曾梦觉·随身册.
 */
const POSITION_KEY = 'somewhere-a-letter:launcher-position:v1';
const GAP = 4;
const DRAG_THRESHOLD = 5;

export function attachMailboxLauncher(button, openMailbox, options = {}) {
    if (!button || typeof openMailbox !== 'function') {
        throw new Error('无法初始化信箱入口。');
    }

    const win = options.win || window;
    const storage = options.storage || win.localStorage;
    let drag = null;
    let suppressClickUntil = 0;

    function viewport() {
        return {
            width: Math.max(0, Number(win.innerWidth) || 0),
            height: Math.max(0, Number(win.innerHeight) || 0),
        };
    }

    function dimensions() {
        return {
            width: Math.max(1, button.offsetWidth || 48),
            height: Math.max(1, button.offsetHeight || 48),
        };
    }

    function clamp(value, upper) {
        return Math.max(GAP, Math.min(Math.max(GAP, upper), Math.round(value)));
    }

    function place(x, y, persist = false) {
        const v = viewport();
        const size = dimensions();
        const px = clamp(x, v.width - size.width - GAP);
        const py = clamp(y, v.height - size.height - GAP);
        button.style.left = px + 'px';
        button.style.top = py + 'px';

        if (persist) {
            try {
                storage.setItem(POSITION_KEY, JSON.stringify([px, py]));
            } catch {
                // A blocked localStorage must never prevent dragging.
            }
        }
        return { x: px, y: py };
    }

    function resetOrRestore() {
        let position = null;
        try {
            const saved = JSON.parse(storage.getItem(POSITION_KEY) || 'null');
            if (Array.isArray(saved) && saved.length === 2
                && Number.isFinite(saved[0]) && Number.isFinite(saved[1])) {
                position = saved;
            }
        } catch {
            // Ignore an invalid or inaccessible saved position.
        }
        if (position) {
            place(position[0], position[1]);
        } else {
            const v = viewport();
            const size = dimensions();
            // Leave the chat input and browser bottom toolbar unobstructed.
            const offset = v.width <= 760 ? 200 : 170;
            place(v.width - size.width - 16, v.height - offset);
        }
    }

    function refit() {
        // Rotation, window resizing or mobile browser viewport changes:
        // keep the seal reachable without overriding its saved position.
        const x = Number.parseFloat(button.style.left);
        const y = Number.parseFloat(button.style.top);
        if (Number.isFinite(x) && Number.isFinite(y)) place(x, y);
        else resetOrRestore();
    }

    function onPointerDown(event) {
        if (event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
        suppressClickUntil = 0;
        const x = Number.parseFloat(button.style.left);
        const y = Number.parseFloat(button.style.top);
        drag = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            left: Number.isFinite(x) ? x : button.offsetLeft,
            top: Number.isFinite(y) ? y : button.offsetTop,
            moved: false,
        };
        try { button.setPointerCapture(event.pointerId); }
        catch { /* The pointer may still drag without capture. */ }
    }

    function onPointerMove(event) {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) <= DRAG_THRESHOLD) return;
        if (!drag.moved) {
            drag.moved = true;
            button.classList.add('sal-dragging');
        }
        place(drag.left + dx, drag.top + dy);
        event.preventDefault?.();
    }

    function finishPointer(event) {
        if (!drag || event.pointerId !== drag.pointerId) return;
        if (drag.moved) {
            const x = Number.parseFloat(button.style.left);
            const y = Number.parseFloat(button.style.top);
            place(x, y, true);
            // Cancel the click synthesized after a touch/mouse drag.
            // Keyboard clicks (detail === 0) are never suppressed.
            suppressClickUntil = Date.now() + 400;
        }
        drag = null;
        button.classList.remove('sal-dragging');
        try { button.releasePointerCapture(event.pointerId); }
        catch { /* Capture may already have been lost. */ }
    }

    function onClick(event) {
        if (event.detail !== 0 && Date.now() < suppressClickUntil) {
            event.preventDefault?.();
            event.stopPropagation?.();
            suppressClickUntil = 0;
            return;
        }
        openMailbox();
    }

    button.addEventListener('pointerdown', onPointerDown);
    button.addEventListener('pointermove', onPointerMove);
    button.addEventListener('pointerup', finishPointer);
    button.addEventListener('pointercancel', finishPointer);
    button.addEventListener('click', onClick);
    win.addEventListener('resize', refit);

    // Initialize after the icon gets a layout box.
    resetOrRestore();

    return () => {
        button.removeEventListener('pointerdown', onPointerDown);
        button.removeEventListener('pointermove', onPointerMove);
        button.removeEventListener('pointerup', finishPointer);
        button.removeEventListener('pointercancel', finishPointer);
        button.removeEventListener('click', onClick);
        win.removeEventListener('resize', refit);
    };
}
