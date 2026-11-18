#!/usr/bin/env bash
# 一键启动：如果服务没在运行就先启动，然后自动用默认浏览器打开页面。
#
# 用法：
#   bash scripts/start.sh          # 打开 http://localhost:3000
#   bash scripts/start.sh --https  # 打开 https://localhost:3443（缺证书会自动生成）

set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${PORT:-3000}"
HTTPS_PORT="${HTTPS_PORT:-3443}"

HTTP_URL="http://localhost:${PORT}"
HTTPS_URL="https://localhost:${HTTPS_PORT}"
CERT_FILE="certs/localhost-cert.pem"

# 需要 HTTPS 时先确保证书存在
if [ "${1:-}" = "--https" ]; then
  OPEN_URL="${HTTPS_URL}"
  if [ ! -f "${CERT_FILE}" ]; then
    echo "尚未找到证书，正在生成自签名证书..."
    bash scripts/gen-cert.sh
  fi
else
  OPEN_URL="${HTTP_URL}"
fi

echo "项目目录：$(pwd)"
echo "HTTP  地址：${HTTP_URL}"
if [ -f "${CERT_FILE}" ]; then
  echo "HTTPS 地址：${HTTPS_URL}（自签名证书，首次需点“高级 → 继续前往”）"
fi
echo "本次打开：${OPEN_URL}"

# 服务是否已启动，以 HTTP 端口为准（HTTP 始终可用）
is_running() {
  if command -v curl >/dev/null 2>&1; then
    curl -s -o /dev/null --max-time 2 "${HTTP_URL}" && return 0
    return 1
  fi
  return 1
}

if is_running; then
  echo "服务已在运行，无需重复启动。"
else
  echo "正在启动 Node 服务..."
  node server.js &
  SERVER_PID=$!
  echo "服务进程 PID：${SERVER_PID}"

  # 最多等待 15 秒，确认端口可访问
  for _ in $(seq 1 15); do
    if is_running; then
      break
    fi
    sleep 1
  done

  if ! is_running; then
    echo "启动失败：${HTTP_URL} 仍无法访问，请检查端口是否被占用（可用 PORT=8080 bash scripts/start.sh 换端口）。"
    exit 1
  fi
  echo "服务启动成功。"
fi

# 自动打开浏览器：Linux / macOS / Windows(Git Bash) 都兼容
open_browser() {
  case "$(uname -s)" in
    Darwin)
      open "${OPEN_URL}"
      ;;
    Linux)
      if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "${OPEN_URL}" >/dev/null 2>&1 &
      elif command -v google-chrome >/dev/null 2>&1; then
        google-chrome "${OPEN_URL}" >/dev/null 2>&1 &
      else
        echo "未找到可用的浏览器启动命令，请手动打开：${OPEN_URL}"
      fi
      ;;
    *)
      echo "请手动在浏览器打开：${OPEN_URL}"
      ;;
  esac
}

open_browser
echo "已在浏览器中打开：${OPEN_URL}"
echo "提示：HTTP 必须写成 http://localhost:${PORT} 并带端口；单独访问 https://localhost（443 端口）会连接失败，HTTPS 请用 ${HTTPS_URL}。"
