'use strict';

/**
 * Hello World 网站 —— 服务端入口
 *
 * 功能：
 *   1. 访问首页时显示 “Hello World!”
 *   2. 首页同时显示当前服务器时间（页面首次加载时由服务端注入，并每 1 秒通过 /api/time 刷新）
 *
 * 特点：只使用 Node.js 内置模块，无需 npm install，无任何第三方依赖。
 * 运行：node server.js（或 npm start），然后浏览器打开 http://localhost:3000
 */

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// 基础配置
// ---------------------------------------------------------------------------
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');

// —— 可选 HTTPS ——
// 默认在 3443 端口额外开一个 HTTPS 服务（高端口不需要 root 权限）。
// 证书由 scripts/gen-cert.sh 生成；没有证书时自动跳过 HTTPS，不影响 HTTP 正常使用。
// 设置 HTTPS=0 可完全关闭 HTTPS；HTTPS_PORT 可改端口。
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
const CERT_DIR = path.join(__dirname, 'certs');
const CERT_KEY_FILE = path.join(CERT_DIR, 'localhost-key.pem');
const CERT_CRT_FILE = path.join(CERT_DIR, 'localhost-cert.pem');

// 运行时目录：保存进程 PID，方便 scripts/stop.sh 精确停止服务
// 文件名带上端口，避免同一项目启动多个实例时互相覆盖
const RUNTIME_DIR = path.join(__dirname, '.run');
const PID_FILE = path.join(RUNTIME_DIR, `server-${PORT}.pid`);

// 服务器启动时刻，用于在页面上展示“已运行时长”
const SERVER_START_AT = new Date();

// 静态资源 MIME 类型映射
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 补零：1 -> "01" */
function pad2(value) {
  return String(value).padStart(2, '0');
}

/**
 * 计算当前服务器时间。
 * 统一换算到中国标准时间（UTC+8），这样无论服务器部署在哪个时区，
 * 页面上显示的都是同一套“北京时间”，不会出现时区错乱。
 */
function getServerTime(date = new Date()) {
  const CST_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8
  const shifted = new Date(date.getTime() + CST_OFFSET_MS);

  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const second = shifted.getUTCSeconds();

  const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const weekday = WEEKDAYS[shifted.getUTCDay()];

  const dateText = `${year} 年 ${pad2(month)} 月 ${pad2(day)} 日`;
  const timeText = `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;

  return {
    // 完整展示文本，例如：2026 年 11 月 18 日 星期三 21:23:05
    text: `${dateText} ${weekday} ${timeText}`,
    dateText,
    weekday,
    timeText,
    // 机器可读格式，方便前端再解析
    iso: `${year}-${pad2(month)}-${pad2(day)} ${timeText}`,
    timeZone: 'UTC+8 (Asia/Shanghai)',
    timestamp: date.getTime()
  };
}

/** 服务器已运行时长，例如：0 天 00:01:23 */
function getUptimeText() {
  const elapsedSeconds = Math.floor((Date.now() - SERVER_START_AT.getTime()) / 1000);
  const days = Math.floor(elapsedSeconds / 86400);
  const hours = Math.floor((elapsedSeconds % 86400) / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  return `${days} 天 ${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

/**
 * 读取本地自签名证书。
 * - 设置环境变量 HTTPS=0 时强制关闭 HTTPS；
 * - 证书文件不存在或读取失败时返回 null，此时只启动 HTTP，不影响正常使用。
 */
function loadHttpsOptions() {
  if (process.env.HTTPS === '0') return null;
  try {
    return {
      key: fs.readFileSync(CERT_KEY_FILE),
      cert: fs.readFileSync(CERT_CRT_FILE)
    };
  } catch {
    return null;
  }
}

/** 统一的文本响应 */
function sendText(res, statusCode, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache'
  });
  res.end(text);
}

/** 统一的 JSON 响应 */
function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  res.end(body);
}

/** 读取并返回静态文件 */
function sendFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      sendText(res, 500, '500 Server Error：页面文件读取失败');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  });
}

/**
 * 渲染首页：读取 public/index.html，把占位符替换成真实数据后返回。
 * 这样即使浏览器禁用了 JavaScript，页面也一定能看到服务器时间。
 */
function renderIndexPage(res) {
  fs.readFile(INDEX_FILE, 'utf8', (err, template) => {
    if (err) {
      sendText(res, 500, '500 Server Error：缺少 public/index.html 文件');
      return;
    }

    const now = getServerTime();
    const html = template
      .replace(/__SERVER_TIME__/g, now.text)
      .replace(/__SERVER_TIME_ISO__/g, now.iso)
      .replace(/__SERVER_DATE__/g, now.dateText)
      .replace(/__SERVER_WEEKDAY__/g, now.weekday)
      .replace(/__SERVER_CLOCK__/g, now.timeText)
      .replace(/__SERVER_UPTIME__/g, getUptimeText())
      .replace(/__SERVER_TIMEZONE__/g, now.timeZone)
      .replace(/__SERVER_START__/g, getServerTime(SERVER_START_AT).text)
      .replace(/__SERVER_NODE_VERSION__/g, process.version);

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    res.end(html);
  });
}

/** 处理 /api/time 接口，返回服务器当前时间（供前端每秒刷新使用） */
function handleTimeApi(res) {
  const now = getServerTime();
  sendJson(res, 200, {
    ok: true,
    ...now,
    uptime: getUptimeText(),
    serverStartAt: getServerTime(SERVER_START_AT).text,
    nodeVersion: process.version,
    pid: process.pid
  });
}

// ---------------------------------------------------------------------------
// 路由分发
// ---------------------------------------------------------------------------
function handleRequest(req, res) {
  // 只接受 GET / HEAD，其余方法统一返回 405
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    sendText(res, 405, '405 Method Not Allowed：仅支持 GET / HEAD 请求');
    return;
  }

  // 解析 URL，去掉查询参数，防止 ../ 目录穿越
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname);
  } catch {
    sendText(res, 400, '400 Bad Request：请求地址不合法');
    return;
  }

  console.log(`[${new Date().toISOString()}] ${req.method} ${pathname}`);

  // 1) 首页
  if (pathname === '/' || pathname === '/index.html') {
    renderIndexPage(res);
    return;
  }

  // 2) 服务器时间接口
  if (pathname === '/api/time') {
    handleTimeApi(res);
    return;
  }

  // 3) 其他静态资源（style.css、favicon.ico 等）
  const safePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  const isInsidePublic = safePath.startsWith(PUBLIC_DIR + path.sep) || safePath === PUBLIC_DIR;

  if (!isInsidePublic) {
    sendText(res, 403, '403 Forbidden：非法访问路径');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (!err && stats.isFile()) {
      sendFile(res, safePath);
      return;
    }

    // 4) 兜底 404
    sendText(
      res,
      404,
      `404 Not Found：${pathname} 不存在。\n可访问的地址：/ 、/api/time 、/style.css`
    );
  });
}

// ---------------------------------------------------------------------------
// 启动服务（HTTP + 可选 HTTPS）
// ---------------------------------------------------------------------------
const httpsOptions = loadHttpsOptions();

const httpServer = http.createServer(handleRequest);
const servers = [httpServer];

function makeErrorHandler(port, protocol) {
  return (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`端口 ${port} 已被占用（${protocol}）：请关闭占用该端口的程序，或换端口启动，例如 PORT=8080 node server.js。`);
    } else if (error.code === 'EACCES') {
      console.error(`没有权限绑定端口 ${port}（${protocol}）：80 / 443 这类小于 1024 的端口需要 root 权限。`);
    } else {
      console.error(`[${protocol}] 服务启动失败：`, error);
    }
    process.exit(1);
  };
}

httpServer.on('error', makeErrorHandler(PORT, 'HTTP'));

httpServer.listen(PORT, HOST, () => {
  // 记录 PID，供停止脚本使用（写入失败不影响服务运行）
  try {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
  } catch {
    // 忽略：例如目录只读时
  }

  console.log('==================================================');
  console.log('  Hello World 网站已启动');
  console.log(`  HTTP   本机访问：http://localhost:${PORT}`);
  console.log(`  HTTP   局域网访问：http://<本机IP>:${PORT}`);
  if (httpsOptions) {
    console.log(`  HTTPS  本机访问：https://localhost:${HTTPS_PORT}`);
    console.log('  HTTPS  自签名证书：首次访问需点“高级 → 继续前往”');
  } else if (process.env.HTTPS === '0') {
    console.log('  HTTPS  已手动关闭（环境变量 HTTPS=0）');
  } else {
    console.log('  HTTPS  未启用（未找到证书）：运行 npm run cert 生成后重启即可');
  }
  console.log(`  服务器时间：${getServerTime().text}`);
  console.log(`  Node 版本：${process.version}`);
  console.log('  按 Ctrl + C 停止服务');
  console.log('==================================================');
});

if (httpsOptions) {
  const httpsServer = https.createServer(httpsOptions, handleRequest);
  servers.push(httpsServer);
  httpsServer.on('error', makeErrorHandler(HTTPS_PORT, 'HTTPS'));
  httpsServer.listen(HTTPS_PORT, HOST);
}

// 优雅退出，避免端口被残留进程占用（HTTP、HTTPS 两个服务一起关闭）
['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => {
    console.log('\n正在关闭服务...');
    try {
      if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    } catch {
      // 忽略清理失败
    }
    let pending = servers.length;
    servers.forEach((item) => {
      item.close(() => {
        pending -= 1;
        if (pending === 0) {
          console.log('服务已关闭');
          process.exit(0);
        }
      });
    });
  });
});
