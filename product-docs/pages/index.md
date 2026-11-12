---
layout: home
hero:
  name: OneLinkAI
  text: 从会用，到理解每一步。
  tagline: 把模型服务接入本机 Agent。知道数据放在哪里、配置改了什么，以及安装、升级和恢复究竟如何发生。
  actions:
    - theme: brand
      text: 完成第一次配置
      link: /guide/quickstart
    - theme: alt
      text: 深入工作原理
      link: /principles/architecture
    - theme: alt
      text: 查阅 15 个 Agent
      link: /reference/agents/
features:
  - title: 一份模型资料，多种客户端
    details: 通过平台 Key 或 BYOK 选择模型，再由适配器写入各 Agent 自己认识的原生配置。
    link: /guide/byok
    linkText: 服务商与模型管理
  - title: 修改之前，先看清楚
    details: 配置先预览，再检查原文件是否变化；写入前备份，写入后回读校验，失败尝试回滚。
    link: /principles/configuration
    linkText: 理解配置事务
  - title: 管理程序，也尊重来源
    details: 检测安装路径、查询发布版本。只有安装来源和目标位置经过确认，才提供对应的一键操作。
    link: /principles/updates
    linkText: 安装与更新的边界
  - title: 本地数据，有据可查
    details: 登录和服务商使用本地加密文件。文档逐项说明密钥、配置、备份与网络请求的位置和限制。
    link: /principles/storage
    linkText: 数据与凭据说明
---

## 这份说明书对应哪个版本？

对应当前工作区 **OneLinkAI Desktop 0.3.2**，源码核对日期 **2026 年 11 月 11 日**。这是当前实现的说明，不是其他 Agent 的完整官方手册，也不承诺其后发布版本保持相同配置格式。

从[阅读路线](/guide/reading)进入，或使用顶部搜索查找“钥匙串”“重启丢失”“Codex”“覆盖”“原渠道更新”等关键词。涉及限制的内容直接写在对应流程中，不要求用户读完全部文档才能判断一次操作会发生什么。

::: tip 先分清三件事
“检测到客户端”“配置文件已写入”“模型请求成功”是三种不同结果。前者证明存在程序，中间证明文件落盘，后者证明一次真实 API 请求得到预期结构的响应。
:::
