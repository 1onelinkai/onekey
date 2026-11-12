# OneLinkAI 官网接口分析

分析时间：2026-10-20。依据公开 HTML 和前端 JavaScript 静态调用点，未登录、未发送验证码、未创建或修改任何平台资源。以下参数是前端观察结果，未经登录态返回值验证，不是平台正式接口契约。

## 来源

- https://onelinkai.cloud/assets/main-Dj39b3MP.js
- https://onelinkai.cloud/assets/LoginFormV2-zfNJYPZj.js
- https://onelinkai.cloud/assets/APIKeyPanel-CKI0C4Cr.js
- https://onelinkai.cloud/assets/index-Bv-A7_3_.js
- https://onelinkai.cloud/assets/index-CT0d_x_y.js
- https://onelinkai.cloud/assets/CommonRecordPage-BSwMYDem.js

API 基址：`https://api.onelinkai.cloud`。
网站管理 API 与模型推理 API 是两套认证语义，不应混用登录 access token 和模型 API Key。

## 登录链路

| 方法 | 路径 | 观察到的参数 / 返回 |
| --- | --- | --- |
| POST | `/sso/client/init` | `{clientType:"router"}`；返回 `data.clientId`、`data.state` |
| POST | `/sso/client/authorize` | `clientType, clientId, state, redirectUri`；返回 `data.authRequestId` |
| POST | `/sso/server/login/accountLogin` | `authRequestId, account, password`；账户密码登录入口 |
| GET | `/sso/client/approve` | query `authRequestId`；返回 `authorizationCode, state` |
| POST | `/sso/client/token` | `clientType, code, state, keepLogin`；返回 `access_token, refresh_token` |
| POST | `/sso/client/getUserInfo` | `{token,clientType:"router"}`；返回 `active`、`userDetails` |
| POST | `/sso/client/refreshToken` | `clientType,refreshToken`；前端同时放在 query 和 body 中 |

大部分管理 API 以业务 `code === 200` 判成功；模型目录存在 `code === 0` 的不同格式。
官网 axios 配置包含 `Authorization: Bearer <access_token>`、`New-API-User: <userId>`、`X-Client-Source: tenant`、`environment: domestic`、`Cache-Control: no-store`。最终应按真实请求确认哪些是必需字段。

建议 Electron 使用独立登录窗口呈现官网自身登录 UI，保持 sandbox / contextIsolation，禁用 Node，严格限制导航和回调来源。优先确认现有 SSO 支持桌面客户端注册、回调白名单和授权码流程；不能假定任意 loopback / 自定义协议回调已被允许。若尚不支持，需实测同源官方登录流程后设计兼容适配，不能凭静态代码声称已打通。不要读取用户其他浏览器的凭据库。登录凭据由主进程管理、safeStorage 加密；渲染层不持有 refresh token 或完整 API Key。401 单次刷新、失败退出，不无限重试。

## 组织、密钥和记录

| 方法 | 路径 | 观察到的请求 / 返回 |
| --- | --- | --- |
| POST | `/user/user/userTenantList` | `{userId}` → 组织数组，字段含 `id,tenantName,adminRole,tenantType` |
| POST | `/user/user/apikey/page` | 个人：`userId,currentPage,pageSize,language:1,tenantType:1`；组织增加 `tenantId,tenantType:2,isAdmin`；返回 `data.records` |
| POST | `/user/user/apikey/pageByQuery` | 请求记录筛选器使用，字段含 `userId,currentPage,pageSize,language,tenantType,type,isAdmin` |
| GET | `/user/user/apikey/detail` | query `id,language`，组织场景追加 `tenantId` |
| GET | `/user/user/apikey/setDetail/{id}` | 密钥路由设置与模型限制信息，完整字段待验证 |
| GET | `/user/user/wallet/getUserWalletByUserId/{userId}` | 个人账户钱包；返回账户级可用余额，不属于某个 API Key |
| GET | `/user/user/tenant/wallet/personal` | 组织/空间账户钱包；参数 `tenantId,userId`，返回 `availableAmountRaw,budgetLimit,usedAmount,tenantBalance` 等账户级预算信息 |
| GET | `/v1/public/models/grouped-by-month` | 官网展示的模型目录；不是该 Key 实际可用模型的保证 |
| POST | `/log/user/call/list` | `userId,tenantId,pageNum,pageSize,startTime,endTime,modelId:[],supplierId:[],apiKey:[],modelTypes:[]` → `data.records,total` |
| POST | `/log/user/call/getUserCallStatistics` | 与记录列表类似的过滤参数；返回 `usage,rpm,tpm` |

前端复制密钥使用 `record.apiKeyPlain`；列表展示使用 `record.apiKey` 并处理星号脱敏。静态调用点不能证明所有账户 / 所有历史密钥都会返回 `apiKeyPlain`。若服务器仅保留哈希或只允许创建时展示一次，客户端无法还原完整密钥，需要平台新增受控授权 / 导出能力。不得使用脱敏值配置本机 Agent，也不应擅自创建、重置密钥。

`isAdmin`、`tenantId` 等从组织返回值构造，不能硬编码管理员权限；最终权限必须依赖服务端校验。前端 `!!localStorage.getItem("adminRole")` 存在字符串布尔值歧义，不应照抄。日志筛选中的 `apiKey` 数组在 UI 中使用的是 Key 记录 ID，待登录实测确认。

## 接入当前项目

1. 保留演示模式；新增真实平台适配器替换 `electron/platform.cjs` 的模拟数据来源。
2. 登录取得用户信息后拉组织列表，使用组织真实 ID；不再硬编码组织名称作为唯一标识。
3. 选择组织后分页拉 Key，仅向 renderer 返回 ID、名称、脱敏值、状态和日期；完整密钥保留在主进程，实际配置时解析。
4. 拒绝已禁用、过期、无完整密钥的记录；模型目录结合密钥权限和实际模型接口确认，不把公开价格目录视为可用授权。
5. 请求记录按用户 / 组织 / Key ID 分页，隔离本机配置历史。默认只读，不调用 Key 新增、删除或修改接口。
6. 用用户主动登录的测试账号验证：登录回调、刷新、组织切换、完整密钥可用性、模型、请求分页及权限拒绝。没有该验证前不能宣称真实平台接入完成。

## 平台侧需要处理的发现

公开主 bundle 中包含 OAuth `client_secret` 配置（此处不记录值）。请核实其有效性，若有效则轮换并迁移到服务端；不要让桌面客户端复用此值。前端还存在将 token 拼入 console 输出的代码，建议移除，避免通过截图、诊断日志泄漏。第三方 OAuth 配置建议单独审查，与本次只读接口对接分开处理。
