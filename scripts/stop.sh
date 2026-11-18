#!/usr/bin/env bash
# 精确停止服务：读取 .run/server-<端口>.pid，只杀掉本项目启动的进程。
# 用法：bash scripts/stop.sh              # 停止 3000 端口实例
#       PORT=8080 bash scripts/stop.sh    # 停止 8080 端口实例

set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${PORT:-3000}"
PID_FILE=".run/server-${PORT}.pid"

if [ ! -f "${PID_FILE}" ]; then
  echo "未找到 ${PID_FILE}，${PORT} 端口上的服务可能没有通过本项目启动（或已停止）。"
  exit 0
fi

PID="$(cat "${PID_FILE}")"

if ! kill -0 "${PID}" 2>/dev/null; then
  echo "进程 ${PID} 已不存在，清理 PID 文件。"
  rm -f "${PID_FILE}"
  exit 0
fi

kill "${PID}"
rm -f "${PID_FILE}"
echo "已停止服务（PID ${PID}，端口 ${PORT}）。"
