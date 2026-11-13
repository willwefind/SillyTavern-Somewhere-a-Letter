/**
 * Optional independent API selection using SillyTavern Connection Manager.
 * The default path keeps v0.1 behavior and follows the current chat API.
 * No API keys are handled or stored by this extension.
 */
export function apiChoices(context) {
    const result = [{ id: '', name: '跟随酒馆当前 API', description: '使用当前模型和生成设置' }];
    const manager = context.ConnectionManagerRequestService;
    if (!manager || typeof manager.getSupportedProfiles !== 'function') return result;
    try {
        const profiles = manager.getSupportedProfiles() || [];
        for (const profile of profiles) {
            if (typeof profile?.id !== 'string' || !profile.id) continue;
            result.push({
                id: profile.id,
                name: String(profile.name || profile.model || '未命名连接'),
                description: String(profile.model || profile.api || ''),
            });
        }
    } catch {
        // Connection Manager can be disabled or not configured.
    }
    return result;
}

export async function generateViaApi(context, { systemPrompt, prompt, profileId = '' }) {
    if (!profileId) {
        if (typeof context.generateRaw !== 'function') throw new Error('当前酒馆不支持独立回信 API。');
        return context.generateRaw({ systemPrompt, prompt });
    }
    const manager = context.ConnectionManagerRequestService;
    if (!manager?.sendRequest || !manager?.getSupportedProfiles || !manager?.constructPrompt) {
        throw new Error('Connection Manager 不可用，请在设置中选择「跟随酒馆当前 API」。');
    }
    const profile = manager.getSupportedProfiles().find(p => p.id === profileId);
    if (!profile) throw new Error('所选 API 连接预设不存在或不可用，请重新选择。');
    const apiMap = context.CONNECT_API_MAP?.[profile.api];
    if (!apiMap || !['openai', 'textgenerationwebui'].includes(apiMap.selected)) {
        throw new Error('此连接预设不支持独立生成。');
    }
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
    ];
    const request = apiMap.selected === 'textgenerationwebui'
        ? manager.constructPrompt(messages, profileId)
        : messages;
    const cap = Number(context.chatCompletionSettings?.openai_max_tokens
        ?? context.powerUserSettings?.amount_gen
        ?? 2048);
    const maxTokens = Number.isFinite(cap) ? Math.min(8192, Math.max(256, Math.floor(cap))) : 2048;
    const result = await manager.sendRequest(profileId, request, maxTokens, {
        stream: false,
        extractData: true,
        includePreset: true,
        includeInstruct: true,
    });
    if (typeof result === 'string') return result;
    const content = result?.content;
    if (typeof content !== 'string') throw new Error('所选 API 未返回可识别的文本回复。');
    return content;
}

/**
 * Human-readable reason when only the current-API choice is available.
 * A working API connection is not the same as a saved Connection Profile.
 */
export function apiProfileStatus(context) {
    const service = context.ConnectionManagerRequestService;
    if (!service) return '当前酒馆未提供连接预设接口。默认 API 仍可正常使用。';
    if (context.extensionSettings?.disabledExtensions?.includes('connection-manager')) {
        return '酒馆的 Connection Profiles（连接配置）扩展已被禁用。请在「扩展 → 管理扩展」中启用。';
    }
    const saved = context.extensionSettings?.connectionManager?.profiles;
    if (Array.isArray(saved) && saved.length === 0) {
        return '还没有已保存的连接预设。请先在酒馆的「API 连接」面板创建 Connection Profile（连接配置），然后点击下方「刷新连接列表」。单纯连接过 API 不会自动成为预设。';
    }
    try {
        const supported = service.getSupportedProfiles();
        if (supported.length) return '找到 ' + supported.length + ' 个可用于独立回信的连接预设。';
        if (Array.isArray(saved) && saved.length) {
            return '找到了 ' + saved.length + ' 个已保存配置，但目前没有符合要求的聊天补全或文本补全连接；请检查其 API 类型和模型设置。';
        }
        return '暂无可用的连接预设。请在酒馆「API 连接」中创建并保存一个 Connection Profile，之后点击「刷新连接列表」。';
    } catch (error) {
        return '读取连接预设失败：' + (error?.message || String(error)) + '。默认 API 不受影响。';
    }
}
