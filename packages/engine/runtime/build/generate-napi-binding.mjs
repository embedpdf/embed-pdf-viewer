#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const generatedDir = resolve(root, 'build/generated');
const functionsPath = resolve(generatedDir, 'functions.json');
const outPath = resolve(generatedDir, 'binding.generated.cc');
const dtsPath = resolve(generatedDir, 'binding.generated.d.ts');

if (!existsSync(functionsPath)) {
  console.error(`missing ${functionsPath}; run generate-functions.mjs first`);
  process.exit(1);
}

mkdirSync(generatedDir, { recursive: true });

const { functions } = JSON.parse(readFileSync(functionsPath, 'utf8'));

/** Pull the native-side ABI kind for a slot. */
const nativeKind = (meta) => meta.native.kind;

function cppType(meta) {
  const k = nativeKind(meta);
  if (k === 'bool') return 'bool';
  if (k === 'f32') return 'float';
  if (k === 'f64') return 'double';
  if (k === 'i64') return 'int64_t';
  if (k === 'void') return 'void';
  if (k === 'pointer' || k === 'cstring' || k === 'utf16ptr') return 'void*';
  return 'int32_t';
}

function readArg(param, index) {
  const name = `arg${index}`;
  const k = nativeKind(param);
  if (k === 'bool') {
    return `  bool ${name};\n  napi_get_value_bool(env, argv[${index}], &${name});`;
  }
  if (k === 'f32' || k === 'f64') {
    return `  double ${name};\n  napi_get_value_double(env, argv[${index}], &${name});`;
  }
  if (k === 'i64' && param.ts === 'number') {
    // size_t / ptrdiff_t on 64-bit native: accept JS Number directly.
    return `  int64_t ${name};\n  napi_get_value_int64(env, argv[${index}], &${name});`;
  }
  if (k === 'i64') {
    // genuine int64_t / uint64_t / long long: BigInt argument.
    return `  int64_t ${name};\n  EpdfGetBigIntInt64(env, argv[${index}], &${name});`;
  }
  if (k === 'cstring' && param.ts === 'string') {
    return (
      `  size_t ${name}_len = 0;\n` +
      `  napi_get_value_string_utf8(env, argv[${index}], nullptr, 0, &${name}_len);\n` +
      `  std::string ${name}_buf(${name}_len, '\\0');\n` +
      `  napi_get_value_string_utf8(env, argv[${index}], ${name}_buf.data(), ${name}_len + 1, &${name}_len);\n` +
      `  auto ${name} = static_cast<void*>(${name}_buf.data());`
    );
  }
  if (k === 'pointer' || k === 'cstring' || k === 'utf16ptr') {
    return `  int64_t ${name}_raw;\n  EpdfGetBigIntInt64(env, argv[${index}], &${name}_raw);\n  auto ${name} = reinterpret_cast<${cppType(param)}>(${name}_raw);`;
  }
  return `  int32_t ${name};\n  napi_get_value_int32(env, argv[${index}], &${name});`;
}

function callArg(param, index) {
  const name = `arg${index}`;
  const k = nativeKind(param);
  if (k === 'f32') return `static_cast<float>(${name})`;
  return name;
}

function returnValue(result) {
  const k = nativeKind(result);
  if (k === 'void') return '  return nullptr;';
  if (k === 'bool') {
    return '  napi_value out;\n  napi_get_boolean(env, static_cast<bool>(result), &out);\n  return out;';
  }
  if (k === 'f32' || k === 'f64') {
    return '  napi_value out;\n  napi_create_double(env, static_cast<double>(result), &out);\n  return out;';
  }
  if (k === 'i64' && result.ts === 'number') {
    // size_t / ptrdiff_t return: hand back a JS Number.
    return '  napi_value out;\n  napi_create_int64(env, static_cast<int64_t>(result), &out);\n  return out;';
  }
  if (k === 'i64') {
    return '  napi_value out;\n  napi_create_bigint_int64(env, static_cast<int64_t>(result), &out);\n  return out;';
  }
  if (k === 'pointer' || k === 'cstring' || k === 'utf16ptr') {
    return '  napi_value out;\n  napi_create_bigint_int64(env, reinterpret_cast<int64_t>(result), &out);\n  return out;';
  }
  return '  napi_value out;\n  napi_create_int32(env, static_cast<int32_t>(result), &out);\n  return out;';
}

const declarations = functions
  .map((fn) => {
    const params = fn.params.map((p, i) => `${cppType(p)} arg${i}`).join(', ');
    return `extern "C" ${cppType(fn.result)} ${fn.name}(${params});`;
  })
  .join('\n');

const wrappers = functions
  .map((fn) => {
    const argc = fn.params.length;
    const reads = fn.params.map(readArg).join('\n');
    const args = fn.params.map(callArg).join(', ');
    const isVoid = nativeKind(fn.result) === 'void';
    const call = isVoid
      ? `  ${fn.name}(${args});\n${returnValue(fn.result)}`
      : `  auto result = ${fn.name}(${args});\n${returnValue(fn.result)}`;
    return `static napi_value Wrap_${fn.name}(napi_env env, napi_callback_info info) {\n  size_t argc = ${argc};\n  napi_value argv[${Math.max(argc, 1)}];\n  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);\n${reads}\n${call}\n}`;
  })
  .join('\n\n');

const exports = functions
  .map(
    (fn) =>
      `  napi_create_function(env, "${fn.name}", NAPI_AUTO_LENGTH, Wrap_${fn.name}, nullptr, &fn);\n  napi_set_named_property(env, exports, "${fn.name}", fn);`,
  )
  .join('\n');

const fileAccessHelpers =
  `typedef int (*FPDF_GetBlock_Callback)(void* param,\n` +
  `                                      unsigned long position,\n` +
  `                                      unsigned char* out,\n` +
  `                                      unsigned long size);\n\n` +
  `typedef struct FPDF_FILEACCESS_ {\n` +
  `  unsigned long m_FileLen;\n` +
  `  FPDF_GetBlock_Callback m_GetBlock;\n` +
  `  void* m_Param;\n` +
  `} FPDF_FILEACCESS;\n\n` +
  `typedef struct FPDF_FILEWRITE_ {\n` +
  `  int version;\n` +
  `  int (*WriteBlock)(struct FPDF_FILEWRITE_* self, const void* data, unsigned long size);\n` +
  `} FPDF_FILEWRITE;\n\n` +
  `struct RuntimeFileAccess final {\n` +
  `  FPDF_FILEACCESS access = {};\n` +
  `  bool memory_backed = false;\n` +
  `  std::vector<uint8_t> bytes;\n` +
  `  std::ifstream file;\n` +
  `  std::mutex mutex;\n\n` +
  `  RuntimeFileAccess() {\n` +
  `    access.m_Param = this;\n` +
  `    access.m_GetBlock = &RuntimeFileAccess::GetBlock;\n` +
  `  }\n\n` +
  `  static int GetBlock(void* param, unsigned long position, unsigned char* out, unsigned long size) {\n` +
  `    auto* self = static_cast<RuntimeFileAccess*>(param);\n` +
  `    const uint64_t begin = static_cast<uint64_t>(position);\n` +
  `    const uint64_t length = static_cast<uint64_t>(size);\n` +
  `    if (!self || begin + length < begin) return 0;\n` +
  `    if (self->memory_backed) {\n` +
  `      if (begin + length > self->bytes.size()) return 0;\n` +
  `      memcpy(out, self->bytes.data() + begin, static_cast<size_t>(length));\n` +
  `      return 1;\n` +
  `    }\n` +
  `    std::lock_guard<std::mutex> lock(self->mutex);\n` +
  `    if (!self->file.is_open()) return 0;\n` +
  `    self->file.clear();\n` +
  `    self->file.seekg(static_cast<std::streamoff>(begin), std::ios::beg);\n` +
  `    if (!self->file) return 0;\n` +
  `    self->file.read(reinterpret_cast<char*>(out), static_cast<std::streamsize>(length));\n` +
  `    return self->file.gcount() == static_cast<std::streamsize>(length) ? 1 : 0;\n` +
  `  }\n` +
  `};\n\n` +
  `struct RuntimeFileWrite final {\n` +
  `  FPDF_FILEWRITE write = {};\n` +
  `  std::ofstream file;\n\n` +
  `  RuntimeFileWrite() {\n` +
  `    write.version = 1;\n` +
  `    write.WriteBlock = &RuntimeFileWrite::WriteBlock;\n` +
  `  }\n\n` +
  `  static int WriteBlock(FPDF_FILEWRITE* self, const void* data, unsigned long size) {\n` +
  `    auto* owner = reinterpret_cast<RuntimeFileWrite*>(self);\n` +
  `    if (!owner || !owner->file.is_open()) return 0;\n` +
  `    owner->file.write(static_cast<const char*>(data), static_cast<std::streamsize>(size));\n` +
  `    return owner->file.good() ? 1 : 0;\n` +
  `  }\n` +
  `};\n\n` +
  `static RuntimeFileAccess* ReadRuntimeFileAccessHandle(napi_env env, napi_value value) {\n` +
  `  int64_t raw = 0;\n` +
  `  EpdfGetBigIntInt64(env, value, &raw);\n` +
  `  return reinterpret_cast<RuntimeFileAccess*>(raw);\n` +
  `}\n\n` +
  `static RuntimeFileWrite* ReadRuntimeFileWriteHandle(napi_env env, napi_value value) {\n` +
  `  int64_t raw = 0;\n` +
  `  EpdfGetBigIntInt64(env, value, &raw);\n` +
  `  return reinterpret_cast<RuntimeFileWrite*>(raw);\n` +
  `}\n\n` +
  `static napi_value CreateMemoryFileAccess(napi_env env, napi_callback_info info) {\n` +
  `  size_t argc = 1;\n` +
  `  napi_value argv[1];\n` +
  `  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);\n` +
  `  void* data = nullptr;\n` +
  `  size_t len = 0;\n` +
  `  napi_get_arraybuffer_info(env, argv[0], &data, &len);\n` +
  `  if (len > std::numeric_limits<unsigned long>::max()) {\n` +
  `    napi_throw_range_error(env, nullptr, "FPDF_FILEACCESS length exceeds unsigned long");\n` +
  `    return nullptr;\n` +
  `  }\n` +
  `  auto* owner = new RuntimeFileAccess();\n` +
  `  owner->memory_backed = true;\n` +
  `  owner->bytes.assign(static_cast<uint8_t*>(data), static_cast<uint8_t*>(data) + len);\n` +
  `  owner->access.m_FileLen = static_cast<unsigned long>(len);\n` +
  `  napi_value out;\n` +
  `  napi_create_bigint_int64(env, reinterpret_cast<int64_t>(owner), &out);\n` +
  `  return out;\n` +
  `}\n\n` +
  `static napi_value CreatePathFileAccess(napi_env env, napi_callback_info info) {\n` +
  `  size_t argc = 1;\n` +
  `  napi_value argv[1];\n` +
  `  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);\n` +
  `  size_t path_len = 0;\n` +
  `  napi_get_value_string_utf8(env, argv[0], nullptr, 0, &path_len);\n` +
  `  std::string path_buf(path_len + 1, '\\0');\n` +
  `  napi_get_value_string_utf8(env, argv[0], path_buf.data(), path_buf.size(), &path_len);\n` +
  `  std::string path(path_buf.data(), path_len);\n` +
  `  auto* owner = new RuntimeFileAccess();\n` +
  `  owner->file.open(path, std::ios::binary | std::ios::in);\n` +
  `  if (!owner->file.is_open()) {\n` +
  `    delete owner;\n` +
  `    napi_throw_error(env, nullptr, "Failed to open file for FPDF_FILEACCESS");\n` +
  `    return nullptr;\n` +
  `  }\n` +
  `  owner->file.seekg(0, std::ios::end);\n` +
  `  const std::streamoff file_size = owner->file.tellg();\n` +
  `  owner->file.seekg(0, std::ios::beg);\n` +
  `  if (file_size < 0 || static_cast<uint64_t>(file_size) > std::numeric_limits<unsigned long>::max()) {\n` +
  `    delete owner;\n` +
  `    napi_throw_range_error(env, nullptr, "FPDF_FILEACCESS file length exceeds unsigned long");\n` +
  `    return nullptr;\n` +
  `  }\n` +
  `  owner->access.m_FileLen = static_cast<unsigned long>(file_size);\n` +
  `  napi_value out;\n` +
  `  napi_create_bigint_int64(env, reinterpret_cast<int64_t>(owner), &out);\n` +
  `  return out;\n` +
  `}\n\n` +
  `static napi_value GetFileAccessPtr(napi_env env, napi_callback_info info) {\n` +
  `  size_t argc = 1;\n` +
  `  napi_value argv[1];\n` +
  `  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);\n` +
  `  auto* owner = ReadRuntimeFileAccessHandle(env, argv[0]);\n` +
  `  napi_value out;\n` +
  `  napi_create_bigint_int64(env, reinterpret_cast<int64_t>(&owner->access), &out);\n` +
  `  return out;\n` +
  `}\n\n` +
  `static napi_value DestroyFileAccess(napi_env env, napi_callback_info info) {\n` +
  `  size_t argc = 1;\n` +
  `  napi_value argv[1];\n` +
  `  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);\n` +
  `  delete ReadRuntimeFileAccessHandle(env, argv[0]);\n` +
  `  return nullptr;\n` +
  `}\n\n` +
  `static napi_value CreatePathFileWrite(napi_env env, napi_callback_info info) {\n` +
  `  size_t argc = 1;\n` +
  `  napi_value argv[1];\n` +
  `  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);\n` +
  `  size_t path_len = 0;\n` +
  `  napi_get_value_string_utf8(env, argv[0], nullptr, 0, &path_len);\n` +
  `  std::string path_buf(path_len + 1, '\\0');\n` +
  `  napi_get_value_string_utf8(env, argv[0], path_buf.data(), path_buf.size(), &path_len);\n` +
  `  std::string path(path_buf.data(), path_len);\n` +
  `  auto* owner = new RuntimeFileWrite();\n` +
  `  owner->file.open(path, std::ios::binary | std::ios::out | std::ios::trunc);\n` +
  `  if (!owner->file.is_open()) {\n` +
  `    delete owner;\n` +
  `    napi_throw_error(env, nullptr, "Failed to open file for FPDF_FILEWRITE");\n` +
  `    return nullptr;\n` +
  `  }\n` +
  `  napi_value out;\n` +
  `  napi_create_bigint_int64(env, reinterpret_cast<int64_t>(owner), &out);\n` +
  `  return out;\n` +
  `}\n\n` +
  `static napi_value GetFileWritePtr(napi_env env, napi_callback_info info) {\n` +
  `  size_t argc = 1;\n` +
  `  napi_value argv[1];\n` +
  `  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);\n` +
  `  auto* owner = ReadRuntimeFileWriteHandle(env, argv[0]);\n` +
  `  napi_value out;\n` +
  `  napi_create_bigint_int64(env, reinterpret_cast<int64_t>(&owner->write), &out);\n` +
  `  return out;\n` +
  `}\n\n` +
  `static napi_value DestroyFileWrite(napi_env env, napi_callback_info info) {\n` +
  `  size_t argc = 1;\n` +
  `  napi_value argv[1];\n` +
  `  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);\n` +
  `  auto* owner = ReadRuntimeFileWriteHandle(env, argv[0]);\n` +
  `  if (owner && owner->file.is_open()) owner->file.close();\n` +
  `  delete owner;\n` +
  `  return nullptr;\n` +
  `}\n\n`;

writeFileSync(
  outPath,
  `/* AUTO-GENERATED - DO NOT EDIT BY HAND. */\n` +
    `#include <node_api.h>\n#include <stdint.h>\n#include <stdlib.h>\n#include <string.h>\n#include <fstream>\n#include <limits>\n#include <mutex>\n#include <string>\n#include <vector>\n\n` +
    `static inline napi_status EpdfGetBigIntInt64(napi_env env, napi_value value, int64_t* result) {\n  // EmbedPDF: per-call lossless sink. The addon is called concurrently by\n  // multiple Node worker threads, so the old shared \`static bool\` global was a\n  // data race; a local is simpler and correct (the lossless flag is unused).\n  bool lossless = false;\n  return napi_get_value_bigint_int64(env, value, result, &lossless);\n}\n\n` +
    fileAccessHelpers +
    `${declarations}\n\n` +
    `static napi_value Alloc(napi_env env, napi_callback_info info) {\n  size_t argc = 1;\n  napi_value argv[1];\n  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);\n  int64_t size = 0;\n  napi_get_value_int64(env, argv[0], &size);\n  void* ptr = malloc(static_cast<size_t>(size));\n  napi_value out;\n  napi_create_bigint_int64(env, reinterpret_cast<int64_t>(ptr), &out);\n  return out;\n}\n\n` +
    `static napi_value Free(napi_env env, napi_callback_info info) {\n  size_t argc = 1;\n  napi_value argv[1];\n  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);\n  int64_t raw = 0;\n  EpdfGetBigIntInt64(env, argv[0], &raw);\n  free(reinterpret_cast<void*>(raw));\n  return nullptr;\n}\n\n` +
    `static napi_value ReadBytes(napi_env env, napi_callback_info info) {\n  size_t argc = 2;\n  napi_value argv[2];\n  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);\n  int64_t raw = 0;\n  int64_t len = 0;\n  EpdfGetBigIntInt64(env, argv[0], &raw);\n  napi_get_value_int64(env, argv[1], &len);\n  void* copy = malloc(static_cast<size_t>(len));\n  memcpy(copy, reinterpret_cast<void*>(raw), static_cast<size_t>(len));\n  napi_value out;\n  napi_create_external_arraybuffer(env, copy, static_cast<size_t>(len), [](napi_env, void* data, void*) { free(data); }, nullptr, &out);\n  return out;\n}\n\n` +
    `static napi_value WriteBytes(napi_env env, napi_callback_info info) {\n  size_t argc = 2;\n  napi_value argv[2];\n  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);\n  int64_t raw = 0;\n  EpdfGetBigIntInt64(env, argv[0], &raw);\n  void* data = nullptr;\n  size_t len = 0;\n  napi_get_arraybuffer_info(env, argv[1], &data, &len);\n  memcpy(reinterpret_cast<void*>(raw), data, len);\n  return nullptr;\n}\n\n` +
    `static napi_value ReadU8String(napi_env env, napi_callback_info info) {\n  size_t argc = 1;\n  napi_value argv[1];\n  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);\n  int64_t raw = 0;\n  EpdfGetBigIntInt64(env, argv[0], &raw);\n  napi_value out;\n  napi_create_string_utf8(env, reinterpret_cast<const char*>(raw), NAPI_AUTO_LENGTH, &out);\n  return out;\n}\n\n` +
    `static napi_value WriteU8String(napi_env env, napi_callback_info info) {\n  size_t argc = 1;\n  napi_value argv[1];\n  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);\n  size_t len = 0;\n  napi_get_value_string_utf8(env, argv[0], nullptr, 0, &len);\n  char* data = static_cast<char*>(malloc(len + 1));\n  napi_get_value_string_utf8(env, argv[0], data, len + 1, &len);\n  napi_value out;\n  napi_create_bigint_int64(env, reinterpret_cast<int64_t>(data), &out);\n  return out;\n}\n\n` +
    `static napi_value ReadU16String(napi_env env, napi_callback_info info) {\n  size_t argc = 1;\n  napi_value argv[1];\n  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);\n  int64_t raw = 0;\n  EpdfGetBigIntInt64(env, argv[0], &raw);\n  const char16_t* data = reinterpret_cast<const char16_t*>(raw);\n  size_t len = 0;\n  while (data[len] != 0) len++;\n  napi_value out;\n  napi_create_string_utf16(env, data, len, &out);\n  return out;\n}\n\n` +
    `static napi_value WriteU16String(napi_env env, napi_callback_info info) {\n  size_t argc = 1;\n  napi_value argv[1];\n  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);\n  size_t len = 0;\n  napi_get_value_string_utf16(env, argv[0], nullptr, 0, &len);\n  char16_t* data = static_cast<char16_t*>(malloc((len + 1) * sizeof(char16_t)));\n  napi_get_value_string_utf16(env, argv[0], data, len + 1, &len);\n  data[len] = 0;\n  napi_value out;\n  napi_create_bigint_int64(env, reinterpret_cast<int64_t>(data), &out);\n  return out;\n}\n\n` +
    `static napi_value Peek(napi_env env, napi_callback_info info) {\n  size_t argc = 2;\n  napi_value argv[2];\n  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);\n  int64_t raw = 0;\n  EpdfGetBigIntInt64(env, argv[0], &raw);\n  char kind[8];\n  size_t kind_len = 0;\n  napi_get_value_string_utf8(env, argv[1], kind, sizeof(kind), &kind_len);\n  napi_value out;\n  if (strcmp(kind, \"i8\") == 0) napi_create_int32(env, *reinterpret_cast<int8_t*>(raw), &out);\n  else if (strcmp(kind, \"i16\") == 0) napi_create_int32(env, *reinterpret_cast<int16_t*>(raw), &out);\n  else if (strcmp(kind, \"i64\") == 0 || strcmp(kind, \"ptr\") == 0) napi_create_bigint_int64(env, *reinterpret_cast<int64_t*>(raw), &out);\n  else if (strcmp(kind, \"f32\") == 0) napi_create_double(env, *reinterpret_cast<float*>(raw), &out);\n  else if (strcmp(kind, \"f64\") == 0) napi_create_double(env, *reinterpret_cast<double*>(raw), &out);\n  else napi_create_int32(env, *reinterpret_cast<int32_t*>(raw), &out);\n  return out;\n}\n\n` +
    `static napi_value Poke(napi_env env, napi_callback_info info) {\n  size_t argc = 3;\n  napi_value argv[3];\n  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);\n  int64_t raw = 0;\n  EpdfGetBigIntInt64(env, argv[0], &raw);\n  char kind[8];\n  size_t kind_len = 0;\n  napi_get_value_string_utf8(env, argv[1], kind, sizeof(kind), &kind_len);\n  if (strcmp(kind, \"i64\") == 0 || strcmp(kind, \"ptr\") == 0) {\n    int64_t value = 0;\n    EpdfGetBigIntInt64(env, argv[2], &value);\n    *reinterpret_cast<int64_t*>(raw) = value;\n  } else if (strcmp(kind, \"f32\") == 0 || strcmp(kind, \"f64\") == 0) {\n    double value = 0;\n    napi_get_value_double(env, argv[2], &value);\n    if (strcmp(kind, \"f32\") == 0) *reinterpret_cast<float*>(raw) = static_cast<float>(value);\n    else *reinterpret_cast<double*>(raw) = value;\n  } else {\n    int32_t value = 0;\n    napi_get_value_int32(env, argv[2], &value);\n    if (strcmp(kind, \"i8\") == 0) *reinterpret_cast<int8_t*>(raw) = static_cast<int8_t>(value);\n    else if (strcmp(kind, \"i16\") == 0) *reinterpret_cast<int16_t*>(raw) = static_cast<int16_t>(value);\n    else *reinterpret_cast<int32_t*>(raw) = value;\n  }\n  return nullptr;\n}\n\n` +
    wrappers +
    `\n\nstatic napi_value Init(napi_env env, napi_value exports) {\n  napi_value fn;\n  napi_create_function(env, "alloc", NAPI_AUTO_LENGTH, Alloc, nullptr, &fn);\n  napi_set_named_property(env, exports, "alloc", fn);\n  napi_create_function(env, "free", NAPI_AUTO_LENGTH, Free, nullptr, &fn);\n  napi_set_named_property(env, exports, "free", fn);\n  napi_create_function(env, "readBytes", NAPI_AUTO_LENGTH, ReadBytes, nullptr, &fn);\n  napi_set_named_property(env, exports, "readBytes", fn);\n  napi_create_function(env, "writeBytes", NAPI_AUTO_LENGTH, WriteBytes, nullptr, &fn);\n  napi_set_named_property(env, exports, "writeBytes", fn);\n  napi_create_function(env, "readU8String", NAPI_AUTO_LENGTH, ReadU8String, nullptr, &fn);\n  napi_set_named_property(env, exports, "readU8String", fn);\n  napi_create_function(env, "writeU8String", NAPI_AUTO_LENGTH, WriteU8String, nullptr, &fn);\n  napi_set_named_property(env, exports, "writeU8String", fn);\n  napi_create_function(env, "readU16String", NAPI_AUTO_LENGTH, ReadU16String, nullptr, &fn);\n  napi_set_named_property(env, exports, "readU16String", fn);\n  napi_create_function(env, "writeU16String", NAPI_AUTO_LENGTH, WriteU16String, nullptr, &fn);\n  napi_set_named_property(env, exports, "writeU16String", fn);\n  napi_create_function(env, "peek", NAPI_AUTO_LENGTH, Peek, nullptr, &fn);\n  napi_set_named_property(env, exports, "peek", fn);\n  napi_create_function(env, "poke", NAPI_AUTO_LENGTH, Poke, nullptr, &fn);\n  napi_set_named_property(env, exports, "poke", fn);\n  napi_create_function(env, "createMemoryFileAccess", NAPI_AUTO_LENGTH, CreateMemoryFileAccess, nullptr, &fn);\n  napi_set_named_property(env, exports, "createMemoryFileAccess", fn);\n  napi_create_function(env, "createPathFileAccess", NAPI_AUTO_LENGTH, CreatePathFileAccess, nullptr, &fn);\n  napi_set_named_property(env, exports, "createPathFileAccess", fn);\n  napi_create_function(env, "getFileAccessPtr", NAPI_AUTO_LENGTH, GetFileAccessPtr, nullptr, &fn);\n  napi_set_named_property(env, exports, "getFileAccessPtr", fn);\n  napi_create_function(env, "destroyFileAccess", NAPI_AUTO_LENGTH, DestroyFileAccess, nullptr, &fn);\n  napi_set_named_property(env, exports, "destroyFileAccess", fn);\n  napi_create_function(env, "createPathFileWrite", NAPI_AUTO_LENGTH, CreatePathFileWrite, nullptr, &fn);\n  napi_set_named_property(env, exports, "createPathFileWrite", fn);\n  napi_create_function(env, "getFileWritePtr", NAPI_AUTO_LENGTH, GetFileWritePtr, nullptr, &fn);\n  napi_set_named_property(env, exports, "getFileWritePtr", fn);\n  napi_create_function(env, "destroyFileWrite", NAPI_AUTO_LENGTH, DestroyFileWrite, nullptr, &fn);\n  napi_set_named_property(env, exports, "destroyFileWrite", fn);\n${exports}\n  return exports;\n}\n\nNAPI_MODULE(NODE_GYP_MODULE_NAME, Init)\n`,
);

writeFileSync(
  dtsPath,
    `/* AUTO-GENERATED - DO NOT EDIT BY HAND. */\n` +
    `export function alloc(bytes: number): bigint;\nexport function free(ptr: bigint): void;\nexport function readBytes(ptr: bigint, len: number): ArrayBuffer;\nexport function writeBytes(ptr: bigint, data: ArrayBuffer): void;\nexport function readU8String(ptr: bigint): string;\nexport function writeU8String(str: string): bigint;\nexport function readU16String(ptr: bigint): string;\nexport function writeU16String(str: string): bigint;\nexport function peek(ptr: bigint, kind: string): number | bigint;\nexport function poke(ptr: bigint, kind: string, value: number | bigint): void;\nexport function createMemoryFileAccess(bytes: ArrayBuffer): bigint;\nexport function createPathFileAccess(path: string): bigint;\nexport function getFileAccessPtr(handle: bigint): bigint;\nexport function destroyFileAccess(handle: bigint): void;\nexport function createPathFileWrite(path: string): bigint;\nexport function getFileWritePtr(handle: bigint): bigint;\nexport function destroyFileWrite(handle: bigint): void;\n` +
    functions.map((fn) => `export function ${fn.name}(...args: unknown[]): unknown;`).join('\n') +
    '\n',
);

console.log(`generated N-API bindings for ${functions.length} functions`);
