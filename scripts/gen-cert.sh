#!/usr/bin/env bash
# 生成本地自签名证书（仅用于本地开发演示 HTTPS）
# 用法：bash scripts/gen-cert.sh   或   npm run cert
# 产物：certs/localhost-key.pem（私钥）、certs/localhost-cert.pem（证书）

set -euo pipefail

cd "$(dirname "$0")/.."

CERT_DIR="certs"
KEY_FILE="${CERT_DIR}/localhost-key.pem"
CRT_FILE="${CERT_DIR}/localhost-cert.pem"

mkdir -p "${CERT_DIR}"

if ! command -v openssl >/dev/null 2>&1; then
  echo "未找到 openssl，请先安装（Ubuntu: sudo apt install openssl；macOS 自带）。"
  exit 1
fi

echo "正在生成自签名证书..."
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 825 \
  -keyout "${KEY_FILE}" \
  -out "${CRT_FILE}" \
  -subj "/C=CN/O=Hello World Local Dev/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1" 2>/dev/null

chmod 600 "${KEY_FILE}"
chmod 644 "${CRT_FILE}"

echo "证书已生成："
echo "  私钥：$(pwd)/${KEY_FILE}"
echo "  证书：$(pwd)/${CRT_FILE}"
echo
openssl x509 -in "${CRT_FILE}" -noout -subject -dates -ext subjectAltName
echo
echo "重启服务后即可用 https://localhost:3443 访问（浏览器会提示自签名证书，点“高级 → 继续前往”即可）。"
