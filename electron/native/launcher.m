#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <dispatch/dispatch.h>
#import <sys/utsname.h>
#import <unistd.h>

@interface OneLinkLaunchDelegate : NSObject <NSApplicationDelegate>
@property(nonatomic, strong) NSTask *runtime;
@end
@implementation OneLinkLaunchDelegate
- (BOOL)applicationShouldHandleReopen:(NSApplication *)application hasVisibleWindows:(BOOL)visible {
  NSRunningApplication *running = [NSRunningApplication runningApplicationWithProcessIdentifier:self.runtime.processIdentifier];
  [running activateWithOptions:NSApplicationActivateIgnoringOtherApps];
  return NO;
}
@end

static NSString *SafeDetails(NSString *text) {
  NSRegularExpression *pattern = [NSRegularExpression regularExpressionWithPattern:@"(?i)(bearer\\s+|(?:access[_-]?token|refresh[_-]?token|api[_-]?key|password)[\\\"'\\s:=]+)[^\\s\\\",;]+" options:0 error:NULL];
  return [pattern stringByReplacingMatchesInString:text options:0 range:NSMakeRange(0, text.length) withTemplate:@"$1[redacted]"];
}
static void ReportFailure(NSString *detail, BOOL automated) {
  struct utsname machine; uname(&machine);
  NSString *report = SafeDetails([NSString stringWithFormat:@"OneLinkAI %@\nmacOS %@\nArchitecture: %s\n%@\n", [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleShortVersionString"] ?: @"unknown", [[NSProcessInfo processInfo] operatingSystemVersionString], machine.machine, detail]);
  fputs([report UTF8String], stderr);
  if (automated) return;
  NSString *logs = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Logs/OneLinkAI"];
  NSError *error = nil;
  [[NSFileManager defaultManager] createDirectoryAtPath:logs withIntermediateDirectories:YES attributes:@{ NSFilePosixPermissions: @0700 } error:&error];
  NSString *file = [logs stringByAppendingPathComponent:@"startup-error.txt"];
  if (!error) {
    [report writeToFile:file atomically:YES encoding:NSUTF8StringEncoding error:&error];
    [[NSFileManager defaultManager] setAttributes:@{ NSFilePosixPermissions: @0600 } ofItemAtPath:file error:NULL];
  }
  [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
  [NSApp activateIgnoringOtherApps:YES];
  NSAlert *alert = [[NSAlert alloc] init];
  alert.alertStyle = NSAlertStyleCritical;
  alert.messageText = @"OneLinkAI 未能正常启动";
  alert.informativeText = @"应用已记录具体错误。点击“复制错误详情”，可直接将错误信息发给技术支持。";
  [alert addButtonWithTitle:@"复制错误详情"];
  [alert addButtonWithTitle:@"关闭"];
  if ([alert runModal] == NSAlertFirstButtonReturn) {
    [[NSPasteboard generalPasteboard] clearContents];
    [[NSPasteboard generalPasteboard] setString:report forType:NSPasteboardTypeString];
  }
}
int main(int argc, const char *argv[]) {
  @autoreleasepool {
    NSArray<NSString *> *arguments = [[[NSProcessInfo processInfo] arguments] subarrayWithRange:NSMakeRange(1, argc - 1)];
    BOOL automated = [arguments containsObject:@"--smoke-test"] || [arguments containsObject:@"--flow-test"] || [arguments containsObject:@"--storage-self-test"];
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    OneLinkLaunchDelegate *delegate = [[OneLinkLaunchDelegate alloc] init];
    NSApp.delegate = delegate;
    [NSApp finishLaunching];
    NSString *runtime = [[[NSBundle mainBundle] bundlePath] stringByAppendingPathComponent:@"Contents/MacOS/OneLinkAI Runtime"];
    NSTask *task = [[NSTask alloc] init];
    delegate.runtime = task;
    task.executableURL = [NSURL fileURLWithPath:runtime];
    task.arguments = arguments;
    task.standardInput = [NSFileHandle fileHandleWithStandardInput];
    task.standardOutput = [NSFileHandle fileHandleWithStandardOutput];
    NSPipe *errorPipe = [NSPipe pipe];
    task.standardError = errorPipe;
    NSMutableData *captured = [NSMutableData data];
    NSLock *lock = [[NSLock alloc] init];
    dispatch_semaphore_t eof = dispatch_semaphore_create(0);
    errorPipe.fileHandleForReading.readabilityHandler = ^(NSFileHandle *handle) {
      @autoreleasepool {
        NSData *data = handle.availableData;
        if (data.length == 0) { dispatch_semaphore_signal(eof); return; }
        write(STDERR_FILENO, data.bytes, data.length);
        [lock lock];
        [captured appendData:data];
        if (captured.length > 65536) [captured replaceBytesInRange:NSMakeRange(0, captured.length - 65536) withBytes:NULL length:0];
        [lock unlock];
      }
    };
    NSError *error = nil;
    if (![task launchAndReturnError:&error]) {
      errorPipe.fileHandleForReading.readabilityHandler = nil;
      ReportFailure([NSString stringWithFormat:@"Runtime launch failed: %@", error], automated);
      return 1;
    }
    while (task.running) {
      [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
    }
    [task waitUntilExit];
    dispatch_semaphore_wait(eof, dispatch_time(DISPATCH_TIME_NOW, 500 * NSEC_PER_MSEC));
    errorPipe.fileHandleForReading.readabilityHandler = nil;
    [lock lock];
    NSString *stderrText = [[NSString alloc] initWithData:captured encoding:NSUTF8StringEncoding] ?: @"Unable to decode runtime output";
    [lock unlock];
    int status = task.terminationStatus;
    if (task.terminationReason == NSTaskTerminationReasonUncaughtSignal) status += 128;
    if (status != 0) ReportFailure([NSString stringWithFormat:@"Runtime exit: %d (%@)\n%@", status, task.terminationReason == NSTaskTerminationReasonUncaughtSignal ? @"signal" : @"exit", stderrText], automated);
    return status;
  }
}
