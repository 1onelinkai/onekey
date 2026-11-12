# 软件更新 API 规范

适用：OneLinkAI macOS、Windows。接口匿名访问，统一使用 HTTPS。版本号使用 SemVer，如 `0.3.3`。

## 1. macOS 查询最新版本

`GET /api/desktop-updates/latest`

请求头：`Accept: application/json`。响应头：`Cache-Control: no-cache`。

| 查询参数 | 必填 | 说明 |
| --- | --- | --- |
| platform | 是 | `darwin` |
| arch | 是 | `arm64`、`x64` |
| currentVersion | 是 | 当前版本号 |

```http
GET /api/desktop-updates/latest?platform=darwin&arch=arm64&currentVersion=0.3.2
```

有新版本返回 `200 application/json`：

```json
{
  "version": "0.3.3",
  "downloadUrl": "https://example.com/downloads/OneLinkAI-0.3.3-arm64.dmg",
  "releaseNotes": "修复已知问题"
}
```

| 响应字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| version | 是 | string | 最新正式版本 |
| downloadUrl | 有更新时 | string | 与官网下载共用的 DMG 地址，支持 HTTPS 绝对地址或接口相对地址 |
| releaseNotes | 否 | string | 更新说明 |
| sha512 | 否 | string | 最终 DMG 的 SHA512，Base64 编码 |
| sha256 | 否 | string | 最终 DMG 的 SHA256，64 位十六进制 |
| size | 否 | integer | 文件字节数，正整数 |
| minimumSystemVersion | 否 | string | 最低系统版本 |
| releaseDate | 否 | string | RFC 3339 时间 |

也接受 `{ "data": { ... } }` 包装。无更新返回 `204`，或 `200` 返回 `{ "version": "0.3.2" }`。macOS 只需上传一个 DMG。

## 2. Windows 查询最新版本

`GET /api/desktop-updates/stable/win32/{arch}/latest.yml`

`arch`：`x64`、`arm64`、`ia32`。响应：`200 application/yaml`，`Cache-Control: no-cache`。

```yaml
version: 0.3.3
files:
  - url: OneLinkAI-Setup-0.3.3.exe
    sha512: <完整EXE的SHA512，Base64编码>
    size: 123456789
path: OneLinkAI-Setup-0.3.3.exe
sha512: <同上>
releaseNotes: 修复已知问题
```

必填：`version`、`files[].url`、`files[].sha512`、`files[].size`、`path`、`sha512`；`releaseNotes`、`releaseDate`、`minimumSystemVersion` 可选。`url` 和 `path` 为同目录下的完整 NSIS EXE 文件名。已是最新也返回清单，由客户端比较版本。

## 3. 安装包下载

macOS 使用 `downloadUrl`；Windows 使用清单目录下的 EXE 地址。

- `GET` 返回 `200` 二进制和准确的 `Content-Length`；`HEAD` 返回相同响应头，无正文。
- 建议支持 `Range` 请求及 `206` 响应。
- 版本化文件使用 `Cache-Control: public, max-age=31536000, immutable`。
- 校验值、大小必须对应最终签名发布文件；先发布安装包，再更新版本信息。

## 4. 状态码

| 状态码 | 说明 |
| --- | --- |
| 200 | 查询成功或下载成功 |
| 204 | macOS 无更新 |
| 206 | 安装包部分内容 |
| 404 | 对应系统架构尚未发布或文件不存在 |
| 503 | 服务暂不可用 |

机器可读定义：[OpenAPI](software-update-api.openapi.yaml)。
