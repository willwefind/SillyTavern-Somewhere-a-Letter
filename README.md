# Somewhere, a Letter · 世界某处的来信 💌

一个轻量的 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 第三方前端扩展，让你给任意角色写一封信，并收到来自这个角色的一封独立回信。

> **v0.1.1 开发测试版**：核心代码已提交；尚未在用户的 SillyTavern 实例和所有 API 提供商中实机验证。

## 安装

1. 打开 SillyTavern → **扩展** → **安装扩展**。
2. 粘贴仓库 URL：

    ~~~text
    https://github.com/willwefind/SillyTavern-Somewhere-a-Letter
    ~~~

3. 安装后刷新网页，点击右下角的 **✉ 信箱**。
4. 在收件人搜索框输入角色卡名称，点击结果选择收件人；填写主题（可选）、署名（可选）和正文，然后点击 **寄出这封信**。

**已有安装如何更新？** 打开 **扩展 → 管理扩展（Manage Extensions）**，找到 Somewhere, a Letter，使用管理界面的**检查更新／更新（Update）**功能，从 GitHub 拉取新版本，然后刷新酒馆页面。**只刷新页面不会从 GitHub 自动拉取最新提交**；部分酒馆配置可能在启动时自动更新，具体以管理界面版本号为准。

## v0.1.1 有什么

- 从酒馆角色列表**搜索角色名称**并选择收件人；最近选过的角色优先展示，支持键盘上下键、回车操作。不会切换正在聊天的角色。
- 用户可以匿名、自由地写真实生活经历，不必填写 Persona 或角色背景。
- 使用酒馆当前 API 配置及其 `generateRaw()` 独立生成回信。
- **仅读取被选择角色的卡片设定 + 主要角色世界书**。主世界书未绑定时可回退到卡内尚未导入的 `character_book`。
- **不读取** 全局世界书、额外关联世界书、聊天世界书、Persona 世界书、当前聊天历史、旧信件。
- 按角色卡标识分组，保存原信和回信；同名角色也不会混在一起。
- 回信可以复制文字，或导出为简洁 PNG 信纸；长文自动分页。
- 纯浏览器前端：无独立服务器、第三方 JS 包或额外 API Key。

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

- 信件存在本浏览器此站点的 **IndexedDB** 中，不会自动云端同步、不会跨设备共享。清除站点数据可能删除存档。
- 目前没有多账户隔离：如果多名用户共用同一个浏览器及同一 SillyTavern 站点来源，可能看到彼此的信件。请勿在公用浏览器存放私密来信。
- 使用远程模型时，寄信内容、角色卡内容和激活的角色世界书会发送给酒馆当前配置的模型提供方。
- 暂无 JSON 备份/同步功能；请及时复制重要信件文字，或导出 PNG。

## 与拾句的关系

这个插件参考了 [拾句 Shiju](https://github.com/willwefind/shiju) 的“文字留存成图”产品方向。为了轻量，v0.1.0 **没有打包拾句的全部 Canvas 引擎、字体和信纸素材**，先实现一个无需依赖的基本 PNG 导出器；之后可视需要复用更多排版功能。

## 技术目录

~~~text
manifest.json     SillyTavern 扩展入口
index.js          信箱 UI、交互和单次通信流程
style.css         桌面/手机适配
src/engine.js     角色卡、主世界书与独立模型生成
src/storage.js    IndexedDB 本地存档
src/export.js     Canvas PNG 图片生成
~~~

## 测试建议

先拿一张只有一个主要世界书的角色卡写短信，验证回信、存档及图片导出。接着选择另一张角色卡写信，检查两张角色卡是否独立、当前普通聊天是否未受影响。同一角色写第二封信时，检查生成是否没有提到第一封的历史。

发现问题欢迎提交 [Issue](https://github.com/willwefind/SillyTavern-Somewhere-a-Letter/issues)。

---

**English:** A small SillyTavern UI extension for sending **one-off letters** to any installed character. Uses the currently configured generation API, the selected card and its primary lorebook. Does not read current chats, Persona, globally selected lorebooks or previous letters. Replies and incoming letters are archived locally and replies can be exported as PNG.
