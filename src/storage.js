const DB = 'somewhere-a-letter';
const TABLE = 'letters';
let dbPromise;
function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        if (!globalThis.indexedDB) return reject(new Error('此浏览器不支持本地信件存档。'));
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => {
            if (!r.result.objectStoreNames.contains(TABLE)) {
                const store = r.result.createObjectStore(TABLE, { keyPath: 'id' });
                store.createIndex('characterId', 'characterId');
            }
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error || new Error('无法打开本地信箱。'));
        r.onblocked = () => reject(new Error('数据库正在被其他标签页占用。'));
    }).catch(error => { dbPromise = null; throw error; });
    return dbPromise;
}
async function run(mode, requestFactory) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(TABLE, mode);
        const request = requestFactory(tx.objectStore(TABLE));
        let result;
        request.onsuccess = () => { result = request.result; };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || request.error || new Error('信件保存失败。'));
        tx.onabort = () => reject(tx.error || new Error('操作已取消。'));
    });
}
export async function saveLetter(letter) { await run('readwrite', store => store.put(letter)); }
export async function listLetters(characterId) {
    const items = await run('readonly', store => store.index('characterId').getAll(characterId));
    return (items || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function deleteLetter(id) { await run('readwrite', store => store.delete(id)); }


/** JSON backup uses the same v1 letter store; no schema migration required. */
export async function listAllLetters() {
    const items = await run('readonly', store => store.getAll());
    return (items || []).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function validatedLetter(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)
        || typeof raw.id !== 'string' || !raw.id || raw.id.length > 200
        || typeof raw.characterId !== 'string' || !raw.characterId
        || typeof raw.characterName !== 'string'
        || typeof raw.createdAt !== 'string' || !Number.isFinite(Date.parse(raw.createdAt))
        || typeof raw.body !== 'string' || typeof raw.reply !== 'string'
        || (raw.title !== undefined && typeof raw.title !== 'string')
        || (raw.signature !== undefined && typeof raw.signature !== 'string')) {
        throw new Error('备份文件包含格式不正确的信件，导入已取消。');
    }
    // Whitelist fields: imported JSON can never insert executable code or arbitrary objects.
    return {
        id: raw.id,
        characterId: raw.characterId,
        characterName: raw.characterName,
        createdAt: raw.createdAt,
        title: raw.title || '',
        signature: raw.signature || '',
        body: raw.body,
        reply: raw.reply,
        starred: raw.starred === true,
    };
}

/** Import new IDs only; existing local records (including stars) are never overwritten. */
export async function importLetters(records) {
    if (!Array.isArray(records) || records.length > 100000) {
        throw new Error('备份信件数量无效。');
    }
    const unique = new Map();
    for (const raw of records) {
        const item = validatedLetter(raw);
        if (!unique.has(item.id)) unique.set(item.id, item);
    }
    if (!unique.size) return { added: 0, skipped: 0 };
    const db = await open();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(TABLE, 'readwrite');
        const store = tx.objectStore(TABLE);
        let added = 0;
        let skipped = 0;
        for (const item of unique.values()) {
            const request = store.get(item.id);
            request.onsuccess = () => {
                if (request.result !== undefined) {
                    skipped++;
                    return;
                }
                store.add(item);
                added++;
            };
        }
        tx.oncomplete = () => resolve({ added, skipped: skipped + records.length - unique.size });
        tx.onerror = () => reject(tx.error || new Error('恢复信件失败。'));
        tx.onabort = () => reject(tx.error || new Error('恢复信件被取消。'));
    });
}
