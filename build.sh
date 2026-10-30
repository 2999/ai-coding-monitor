#!/bin/bash
# AI Coding Monitor 一键构建脚本：打包 → ad-hoc 签名 → 生成 zip 分发包 → 安装到 /Applications
set -euo pipefail
cd "$(dirname "$0")"

APP_NAME="AI Coding Monitor"
APP_PATH="dist/mac-arm64/${APP_NAME}.app"
DEST="/Applications/${APP_NAME}.app"
ZIP_PATH="dist/AI-Coding-Monitor-mac-arm64.zip"

echo "==> 1/5 清理旧构建产物"
rm -rf dist

echo "==> 2/5 打包 .app"
npx electron-builder --mac dir

if [ ! -d "${APP_PATH}" ]; then
  echo "未找到构建产物：${APP_PATH}" >&2
  exit 1
fi

echo "==> 3/5 ad-hoc 签名"
codesign --force --deep --sign - "${APP_PATH}"
codesign --verify --deep --strict "${APP_PATH}"
echo "    签名验证通过 (adhoc)"

echo "==> 4/5 生成 zip 分发包"
ditto -c -k --sequesterRsrc --keepParent "${APP_PATH}" "${ZIP_PATH}"
echo "    已生成 ${ZIP_PATH}"

echo "==> 5/5 安装到 /Applications"
rm -rf "${DEST}"
cp -R "${APP_PATH}" "${DEST}"
echo "    已安装到 ${DEST}"

echo ""
echo "完成。启动方式：open -a \"${APP_NAME}\""
echo "分发包：${ZIP_PATH}"
