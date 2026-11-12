const { Provider } = require('electron-updater/out/providers/Provider');
const semver = require('semver');

function httpsURL(value, base) {
  const url = new URL(value, base);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('更新接口和安装包必须使用可信 HTTPS 地址');
  return url;
}

function normalizeSoftwareRelease(payload, { endpoint, currentVersion }) {
  const release = payload?.data ?? payload;
  if (!release || !semver.valid(release.version)) throw new Error('软件版本接口缺少有效的 version');
  if (!semver.gt(release.version, currentVersion)) return { version: release.version, files: [] };
  const url = httpsURL(release.downloadUrl, endpoint);
  if (!release.downloadUrl) throw new Error('软件版本接口缺少 downloadUrl');
  if (release.sha512 != null && !/^[A-Za-z0-9+/]{86}==$/.test(release.sha512)) throw new Error('软件更新 SHA512 格式错误');
  if (release.sha256 != null && !/^[a-f\d]{64}$/i.test(release.sha256)) throw new Error('软件更新 SHA256 格式错误');
  if (release.size != null && (!Number.isSafeInteger(release.size) || release.size <= 0)) throw new Error('软件安装包大小无效');
  return { version: release.version, releaseNotes: release.releaseNotes, minimumSystemVersion: release.minimumSystemVersion,
    releaseDate: release.releaseDate,
    files: [{ url: url.href, format: 'dmg', sha512: release.sha512, sha256: release.sha256, size: release.size }] };
}

class SoftwareUpdateApiProvider extends Provider {
  constructor(options, updater, runtimeOptions) {
    super({ ...runtimeOptions, isUseMultipleRangeRequest: false });
    this.endpoint = httpsURL(options.url);
    this.arch = options.arch;
    this.version = updater.currentVersion.version;
  }
  async getLatestVersion() {
    const url = new URL(this.endpoint);
    url.searchParams.set('platform', 'darwin');
    url.searchParams.set('arch', this.arch);
    url.searchParams.set('currentVersion', this.version);
    const raw = await this.httpRequest(url, { Accept: 'application/json', 'Cache-Control': 'no-cache' });
    if (!raw) return { version: this.version, files: [] }; // Existing APIs may return 204 for no update.
    return normalizeSoftwareRelease(JSON.parse(raw), { endpoint: url, currentVersion: this.version });
  }
  resolveFiles(info) {
    return info.files.map(file => ({ url: httpsURL(file.url), info: file }));
  }
}

module.exports = { httpsURL, normalizeSoftwareRelease, SoftwareUpdateApiProvider };
