# Somewhere, a Letter · 世界某处的来信 💌

一个轻量的 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 第三方前端扩展，让你给任意角色写一封信，并收到来自这个角色的一封独立回信。

> **v0.1.2 开发测试版**：v0.1.1 的寄信、回信、角色搜索及 PNG 导出已收到实机测试反馈；v0.1.2 新增功能仍需在酒馆中测试。

## 安装

1. 打开 SillyTavern → **扩展** → **安装扩展**。
2. 粘贴仓库 URL：

    ~~~text
    https://github.com/willwefind/SillyTavern-Somewhere-a-Letter
    ~~~

3. 安装后刷新网页，点击右下角的 **✉ 信箱**。
4. 在收件人搜索框输入角色卡名称，点击结果选择收件人；填写主题（可选）、署名（可选）和正文，然后点击 **寄出这封信**。

**已有安装如何更新？** 打开 **扩展 → 管理扩展（Manage Extensions）**，找到 Somewhere, a Letter，使用管理界面的**检查更新／更新（Update）**功能，从 GitHub 拉取新版本，然后刷新酒馆页面。**只刷新页面不会从 GitHub 自动拉取最新提交**；部分酒馆配置可能在启动时自动更新，具体以管理界面版本号为准。

## v0.1.2 有什么

- 从酒馆角色列表**搜索角色名称**并选择收件人；最近选过的角色优先展示，支持键盘上下键、回车操作。不会切换正在聊天的角色。
- 用户可以匿名、自由地写真实生活经历，不必填写 Persona 或角色背景。
- 使用酒馆当前 API 配置及其 `generateRaw()` 独立生成回信。
- **仅读取被选择角色的卡片设定 + 主要角色世界书**。主世界书未绑定时可回退到卡内尚未导入的 `character_book`。
- **不读取** 全局世界书、额外关联世界书、聊天世界书、Persona 世界书、当前聊天历史、旧信件。
- 按角色卡标识分组，保存原信和回信；同名角色也不会混在一起。
- 为信件添加 **★ 收藏/取消收藏**，在侧栏切换「全部 / 收藏」，信件详情同样可以收藏。
- 无主题时，信件列表自动截取来信的第一句有意义的文字作为标题，不额外调用 API。
- 按角色分别**自动保存未寄出的草稿**；切换收件人或刷新酒馆后可以恢复。
- **JSON 备份及恢复**：备份包含所有角色的信件、收藏标记、已有草稿；恢复时跳过同 ID 信件，不覆盖现存记录和草稿。
- 回信可以复制文字，或导出为简洁 PNG 信纸；长文自动分页，日期使用浏览器的本地日期。
- 纯浏览器前端：无独立服务器、第三方 JS 包或额外 API Key。

## v0.1.2 更新说明

- 直接在当前插件的「管理扩展」页面更新到 v0.1.2，再刷新酒馆页面即可；**不必卸载、不必删除旧版本**。
- 已有信件依然保存在同一个 IndexedDB 数据库中；旧信件默认为未收藏，不需要迁移或重新生成。
- 收藏状态存入原信件记录的 `starred` 字段，**不会进入模型上下文**。
- 草稿使用浏览器 LocalStorage 单独按角色卡标识保存，不作为通信记忆；寄信生成并成功归档后才清空该角色草稿，API 失败则保留。
- 备份按钮位于收件人列表下方，导出为包含所有角色信件与草稿的 JSON 文件；恢复操作需明确确认，已有信件与已有草稿不会被覆盖。收藏状态跟随备份文件保存。
- JSON 文件包含来信、回信及可能的私人现实生活内容，请妥善保管，不建议公开上传。

## v0.1.1 更新说明

- 原生下拉菜单改为可搜索角色列表；选中的角色在左侧明确显示。
- 搜索按角色卡名称匹配（不自动识别“昵称／别称”或把拼音还原成中文），对英文名大小写不敏感。
- 最近选择记录仅保留浏览器本地的少量角色标识，用于列表排序，不含任何信件正文，也不参与 API 上下文。
- 信件归档仍按原来的角色标识存储，**无需迁移、不会清空 v0.1.0 旧信**。

## 重要设计规则

**每封都是第一次通信。** 新信件的生成上下文只包含本次来信和所选角色的信息。旧信件只用于归档，不会被送往模型形成长期记忆。不建立关系状态、好感度、长期通信或固定篇幅模板。

世界书目前采用轻量匹配：常驻条目、主要关键词和次级关键词条件、禁用条目过滤、字数预算。**不承诺完全复现** SillyTavern 的世界书递归、正则、概率、自动化等高级激活机制。大型世界书超出预算的条目会被跳过。

角色卡的开场白、示例对话不会被用于生成，避免借用既有 User 关系。Scenario 仅作为世界背景参考，陌生人设定优先。

## 隐私与存储

- 信件存在本浏览器此站点的 **IndexedDB** 中，未寄出的草稿位于浏览器 LocalStorage。不会自动云端同步、不会跨设备共享，清除站点数据可能同时删除两者。请定期导出 JSON 文件备份。
- 目前没有多账户隔离：如果多名用户共用同一个浏览器及同一 SillyTavern 站点来源，可能看到彼此的信件。请勿在公用浏览器存放私密来信。
- 使用远程模型时，寄信内容、角色卡内容和激活的角色世界书会发送给酒馆当前配置的模型提供方。
- JSON 备份/恢复仅本地执行，没有云端同步。恢复时按信件 ID 跳过重复记录，不覆盖已有数据；若某张角色卡已删除或重新导入且标识不同，旧信仍会存在数据库和备份文件中，但不会自动映射至另一张角色卡。

## 与拾句的关系

这个插件参考了 [拾句 Shiju](https://github.com/willwefind/shiju) 的“文字留存成图”产品方向。为了轻量，v0.1.0 **没有打包拾句的全部 Canvas 引擎、字体和信纸素材**，先实现一个无需依赖的基本 PNG 导出器；之后可视需要复用更多排版功能。

## 技术目录

~~~text
manifest.json     SillyTavern 扩展入口
index.js          信箱 UI、交互和单次通信流程
style.css         桌面/手机适配
src/engine.js     角色卡、主世界书与独立模型生成
src/storage.js    IndexedDB 本地存档、收藏字段与导入导出
src/drafts.js     角色独立草稿 LocalStorage
src/backup.js     JSON 备份与无覆盖恢复
src/export.js     Canvas PNG 图片生成
~~~

## 测试建议

验证路径：

1. 给小陆已有信件点星星，切换「收藏」筛选，再取消收藏；确认其他角色信箱不受影响。
2. 给小谢写半封草稿，切换小陆再切回来，再刷新页面，检查标题、署名、正文恢复。
3. 故意让 API 生成失败，确认草稿未被清除；成功寄出且归档后检查该角色草稿清除。
4. 导出 JSON 备份，检查文件已下载；再恢复同一个 JSON，检查旧信未重复、收藏未丢失。
5. 给未填写主题的信件检查列表显示的正文摘要；在本地凌晨导出 PNG，检查日期是否正确。

发现问题欢迎提交 [Issue](https://github.com/willwefind/SillyTavern-Somewhere-a-Letter/issues)。

---

**English:** A small SillyTavern UI extension for sending **one-off letters** to any installed character. Uses the currently configured generation API, the selected card and its primary lorebook. Does not read current chats, Persona, globally selected lorebooks or previous letters. Replies and incoming letters are archived locally, can be starred and filtered, and replies can be exported as PNG. Per-character drafts autosave locally, and a JSON backup/restore feature is provided.
