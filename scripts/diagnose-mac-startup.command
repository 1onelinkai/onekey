#!/bin/bash
# Uses only macOS tools. Does not change quarantine, signing, permissions or security settings.
set -u
umask 077

scratch=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/onelink-startup.XXXXXX") || exit 1
report_dir="$HOME/Desktop"
[ -d "$report_dir" ] && [ -w "$report_dir" ] || report_dir="$scratch"
report="$report_dir/OneLinkAI-startup-$(/bin/date +%Y%m%d-%H%M%S).txt"
exec > >(/usr/bin/tee "$report") 2>&1

printf 'OneLinkAI startup diagnostics\n'
printf 'Time: '; /bin/date -u '+%Y-%m-%d %H:%M:%S UTC'
/usr/bin/sw_vers
/usr/bin/uname -m
printf '\nThis check uses temporary app profiles. It does not read saved credentials.\n'

app_path="${1:-}"
if [ -z "$app_path" ]; then
  # Prefer the mounted release being tested over a possibly stale installed version.
  for candidate in /Volumes/OneLinkAI*/OneLinkAI.app; do
    [ -d "$candidate" ] || continue
    printf 'Mounted candidate: %s\n' "$candidate"
    /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$candidate/Contents/Info.plist" 2>/dev/null
    app_path="$candidate"
  done
  if [ -z "$app_path" ]; then
    for candidate in /Applications/OneLinkAI.app "$HOME/Applications/OneLinkAI.app"; do
      [ -d "$candidate" ] || continue
      app_path="$candidate"
      break
    done
  fi
fi
if [ ! -d "$app_path" ]; then
  printf '\nApplication not found. Mount the OneLinkAI DMG, then run this script again.\nReport: %s\n' "$report"
  exit 2
fi
binary="$app_path/Contents/MacOS/OneLinkAI"
printf '\nApplication: %s\n' "$app_path"
for field in CFBundleShortVersionString CFBundleVersion CFBundleIdentifier CFBundleExecutable LSMinimumSystemVersion; do
  printf '%s: ' "$field"
  /usr/libexec/PlistBuddy -c "Print :$field" "$app_path/Contents/Info.plist" 2>&1
done
/bin/ls -ld "$app_path" "$app_path/Contents" "$app_path/Contents/MacOS" "$binary"
/usr/bin/file "$binary"
if [ ! -f "$binary" ] || [ ! -x "$binary" ]; then
  printf '\nExecutable missing or not executable. Report: %s\n' "$report"
  exit 3
fi
printf '\n[Signature verification]\n'
/usr/bin/codesign --verify --deep --strict --verbose=2 "$app_path" 2>&1
printf 'codesign exit: %s\n' "$?"
printf '\n[System assessment]\n'
/usr/sbin/spctl --assess --type execute --verbose=4 "$app_path" 2>&1
printf 'spctl exit: %s\n' "$?"
printf '\n[Quarantine metadata; read only]\n'
/usr/bin/xattr -p com.apple.quarantine "$app_path" 2>&1
printf '\n[File fingerprints]\n'
/usr/bin/shasum -a 256 "$binary" "$app_path/Contents/Resources/app.asar" 2>&1

run_bounded() {
  local label="$1" limit="$2" task_pid elapsed result
  shift 2
  printf '\n[%s]\n' "$label"
  "$@" > "$scratch/$label.log" 2>&1 &
  task_pid=$!
  elapsed=0
  while /bin/kill -0 "$task_pid" 2>/dev/null && [ "$elapsed" -lt "$limit" ]; do
    /bin/sleep 1
    elapsed=$((elapsed + 1))
  done
  if /bin/kill -0 "$task_pid" 2>/dev/null; then
    printf 'Timed out after %s seconds\n' "$limit"
    /bin/kill -TERM "$task_pid" 2>/dev/null || true
    /bin/sleep 1
    /bin/kill -KILL "$task_pid" 2>/dev/null || true
  fi
  wait "$task_pid"
  result=$?
  /bin/cat "$scratch/$label.log"
  printf '%s exit: %s\n' "$label" "$result"
  return "$result"
}

# First request launch through the same system service as Finder.
run_bounded finder-launch 30 /usr/bin/open -n -W "$app_path" --args --smoke-test "--user-data-dir=$scratch/finder-profile"
finder_result=$?
# Then capture loader/runtime stderr directly, including failures before JavaScript starts.
run_bounded direct-launch 30 "$binary" --smoke-test --enable-logging=stderr "--user-data-dir=$scratch/direct-profile"
direct_result=$?
if [ "$direct_result" -ne 0 ]; then
  run_bounded graphics-comparison 30 "$binary" --smoke-test --disable-gpu --enable-logging=stderr "--user-data-dir=$scratch/graphics-profile"
fi
run_bounded system-launch-log 15 /usr/bin/log show --last 3m --style compact --predicate '(process == "amfid" OR process == "syspolicyd" OR process == "runningboardd" OR process == "launchservicesd") AND (eventMessage CONTAINS[c] "OneLinkAI" OR eventMessage CONTAINS[c] "cloud.onelinkai.desktop")'
printf '\nFinder result: %s; direct result: %s\n' "$finder_result" "$direct_result"
printf 'Report saved: %s\n' "$report"
printf 'Send this report back for diagnosis. Temporary test files: %s\n' "$scratch"
