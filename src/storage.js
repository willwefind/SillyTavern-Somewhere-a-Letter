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
