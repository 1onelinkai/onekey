// Only called with a command reconstructed from verified installation ownership.
const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";
function authorizationScript(manager, args) {
  const command = [manager, ...args].map(quote).join(' ');
  // AppleScript string escaping is separate from POSIX shell argument escaping.
  const literal = '"' + command.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"';
  return 'do shell script ' + literal + ' with administrator privileges';
}
async function runAuthorized(execute, manager, args) {
  return execute('/usr/bin/osascript', ['-e', authorizationScript(manager, args)], { timeout: 180000 });
}
module.exports = { authorizationScript, runAuthorized };
