#include <node_api.h>
#include <Security/Security.h>
#include <string>

// Disallow SecurityAgent UI for this process, including Chromium's keychain calls.
static napi_value DisableUI(napi_env env, napi_callback_info info) {
  OSStatus status = SecKeychainSetUserInteractionAllowed(false);
  if (status != errSecSuccess) { napi_throw_error(env, "KEYCHAIN_UNAVAILABLE", "Cannot disable keychain interaction"); return nullptr; }
  napi_value result; napi_get_undefined(env, &result); return result;
}
static napi_value Read(napi_env env, napi_callback_info info) {
  napi_value args[2]; size_t count = 2;
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  if (count != 2) { napi_throw_type_error(env, nullptr, "Expected service and account"); return nullptr; }
  std::string values[2];
  for (int i = 0; i < 2; i++) {
    size_t length; if (napi_get_value_string_utf8(env, args[i], nullptr, 0, &length) != napi_ok) { napi_throw_type_error(env, nullptr, "Expected string"); return nullptr; }
    values[i].resize(length + 1); napi_get_value_string_utf8(env, args[i], values[i].data(), length + 1, &length); values[i].resize(length);
  }
  UInt32 length = 0; void* bytes = nullptr;
  OSStatus status = SecKeychainFindGenericPassword(nullptr, values[0].size(), values[0].data(), values[1].size(), values[1].data(), &length, &bytes, nullptr);
  napi_value result;
  if (status == errSecItemNotFound) { napi_get_null(env, &result); return result; }
  if (status != errSecSuccess) { napi_throw_error(env, "KEYCHAIN_ACCESS_DENIED", "Credential access unavailable; password prompts are disabled"); return nullptr; }
  napi_create_buffer_copy(env, length, bytes, nullptr, &result);
  SecKeychainItemFreeContent(nullptr, bytes); return result;
}
static napi_value Add(napi_env env, napi_callback_info info) {
  napi_value args[3]; size_t count = 3; napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  if (count != 3) { napi_throw_type_error(env, nullptr, "Expected service, account, key"); return nullptr; }
  std::string values[2];
  for (int i = 0; i < 2; i++) {
    size_t length; if (napi_get_value_string_utf8(env, args[i], nullptr, 0, &length) != napi_ok) { napi_throw_type_error(env, nullptr, "Expected string"); return nullptr; }
    values[i].resize(length + 1); napi_get_value_string_utf8(env, args[i], values[i].data(), length + 1, &length); values[i].resize(length);
  }
  void* bytes; size_t length;
  if (napi_get_buffer_info(env, args[2], &bytes, &length) != napi_ok) { napi_throw_type_error(env, nullptr, "Expected Buffer"); return nullptr; }
  // The default ACL trusts the creating signed application, not all applications.
  OSStatus status = SecKeychainAddGenericPassword(nullptr, values[0].size(), values[0].data(), values[1].size(), values[1].data(), length, bytes, nullptr);
  if (status != errSecSuccess && status != errSecDuplicateItem) { napi_throw_error(env, "KEYCHAIN_UNAVAILABLE", "Cannot create application credential without interaction"); return nullptr; }
  napi_value result; napi_get_undefined(env, &result); return result;
}
NAPI_MODULE_INIT() {
  napi_property_descriptor props[] = {
    {"disableUI", nullptr, DisableUI, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"read", nullptr, Read, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"add", nullptr, Add, nullptr, nullptr, nullptr, napi_default, nullptr}
  };
  napi_define_properties(env, exports, 3, props); return exports;
}
