// Drafts are local-only, scoped to a character-card avatar ID.
// They are deliberately excluded from ALL model generation prompts.
const PREFIX = 'somewhere-a-letter:draft:v1:';
const key = characterId => PREFIX + encodeURIComponent(String(characterId));

function validDraft(value) {
    return value && typeof value === 'object'
        && typeof value.characterId === 'string' && value.characterId.length > 0
        && typeof value.title === 'string'
        && typeof value.signature === 'string'
        && typeof value.body === 'string';
}

export function getDraft(characterId) {
    if (!characterId) return null;
    try {
        const raw = localStorage.getItem(key(characterId));
        if (!raw) return null;
        const draft = JSON.parse(raw);
        return validDraft(draft) && draft.characterId === characterId ? draft : null;
    } catch {
        return null;
    }
}

export function saveDraft(characterId, { title, signature, body }) {
    if (!characterId) return;
    const data = { characterId, title: String(title), signature: String(signature), body: String(body) };
    if (!data.title && !data.signature && !data.body) {
        localStorage.removeItem(key(characterId));
        return;
    }
    localStorage.setItem(key(characterId), JSON.stringify(data));
}

export function clearDraft(characterId) {
    if (characterId) localStorage.removeItem(key(characterId));
}

export function exportDrafts() {
    const drafts = [];
    for (let i = 0; i < localStorage.length; i++) {
        const storageKey = localStorage.key(i);
        if (!storageKey?.startsWith(PREFIX)) continue;
        try {
            const value = JSON.parse(localStorage.getItem(storageKey));
            if (validDraft(value) && storageKey === key(value.characterId)) drafts.push(value);
        } catch { /* Ignore invalid or stale data. */ }
    }
    return drafts;
}

/** Import drafts only where no local draft exists, never overwrite ongoing writing. */
export function importDrafts(drafts) {
    if (!Array.isArray(drafts) || drafts.length > 100000) throw new Error('草稿备份格式不正确。');
    if (!drafts.every(validDraft)) throw new Error('备份中有格式不正确的草稿。');
    let added = 0;
    for (const draft of drafts) {
        if (localStorage.getItem(key(draft.characterId)) !== null) continue;
        saveDraft(draft.characterId, draft);
        added++;
    }
    return added;
}
