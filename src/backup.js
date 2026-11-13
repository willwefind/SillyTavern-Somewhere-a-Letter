import { listAllLetters, importLetters } from './storage.js';
import { exportDrafts, importDrafts } from './drafts.js';

export const BACKUP_FORMAT = 'somewhere-a-letter';
export const MAX_BACKUP_BYTES = 30 * 1024 * 1024;

export async function createBackup() {
    const letters = await listAllLetters();
    let drafts = [];
    try { drafts = exportDrafts(); }
    catch { /* LocalStorage can be disabled; letters are still backed up. */ }
    return {
        format: BACKUP_FORMAT,
        version: 1,
        exportedAt: new Date().toISOString(),
        letters,
        drafts,
    };
}

export function downloadJson(backup) {
    const content = JSON.stringify(backup, null, 2);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date();
    const day = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
    link.href = url;
    link.download = 'Somewhere-a-Letter-backup-' + day + '.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export async function restoreBackup(file, confirmImport) {
    if (!file || file.size > MAX_BACKUP_BYTES) throw new Error('备份文件超过 30 MB，无法导入。');
    const content = await file.text();
    let backup;
    try { backup = JSON.parse(content); }
    catch { throw new Error('无法解析 JSON 文件。'); }
    if (!backup || backup.format !== BACKUP_FORMAT || backup.version !== 1
        || !Array.isArray(backup.letters)
        || (backup.drafts !== undefined && !Array.isArray(backup.drafts))) {
        throw new Error('这不是支持的 Somewhere, a Letter 备份文件。');
    }
    // Validate all drafts before modifying any letter archive.
    const drafts = backup.drafts || [];
    if (drafts.length > 100000 || drafts.some(item =>
        !item || typeof item.characterId !== 'string' || !item.characterId
        || typeof item.title !== 'string' || typeof item.signature !== 'string'
        || typeof item.body !== 'string')) {
        throw new Error('备份中的草稿格式不正确。');
    }
    if (!confirmImport(backup.letters.length, drafts.length)) return null;
    const letters = await importLetters(backup.letters);
    let draftCount = 0;
    try { draftCount = importDrafts(drafts); }
    catch (error) {
        return { ...letters, drafts: 0, warning: '信件已恢复，但草稿恢复失败：' + error.message };
    }
    return { ...letters, drafts: draftCount, warning: '' };
}
