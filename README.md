# Hello World 网站（Node.js）

一个**零依赖**的 Node.js 网站：浏览器打开首页即显示 **Hello World!**，同时展示**当前服务器时间**（首屏由服务端注入，之后每 1 秒通过接口同步刷新）。

## 一、项目结构

```
hello-world-nodejs/
├── package.json          # 项目描述与启动脚本（无任何第三方依赖）
├── server.js             # 服务入口：HTTP(3000) + 可选 HTTPS(3443)、路由、静态资源、时间接口
├── scripts/
│   ├── start.sh          # 一键启动：没运行就启动，然后自动打开浏览器（可加 --https）
│   ├── stop.sh           # 按 .run/server.pid 精确停止服务
│   └── gen-cert.sh       # 生成本地自签名证书（certs/ 目录）
├── public/
│   ├── index.html        # 首页模板，含 __SERVER_TIME__ 等服务端占位符
│   └── style.css         # 页面样式
├── certs/                # 证书目录（由 gen-cert.sh 生成，已在 .gitignore 中忽略）
│   ├── localhost-key.pem
│   └── localhost-cert.pem
├── .run/                 # 运行时目录：server-<端口>.pid（自动生成，已忽略）
├── .gitignore            # 忽略 node_modules、日志、证书等
└── README.md             # 使用说明（本文件）
```

## 二、环境要求

- Node.js >= 18（推荐 20 / 22，本项目在 Node.js 22 上验证通过）
- 不需要 `npm install`，因为没有第三方依赖

检查版本：

```bash
node -v
```

## 三、运行命令

> ⚠️ 打开页面时地址必须是 **`http://localhost:3000`**（http 协议 + 3000 端口）。
> 如果输入 `https://localhost`，浏览器会去连 **443 端口并要求 TLS 证书**，本项目并没有在该端口监听，所以会显示「拒绝了我们的连接请求」。详见第六节。

### 方式 0：一键启动并自动打开浏览器（推荐）

```bash
cd hello-world-nodejs
npm run open
# 等价于
bash scripts/start.sh
```

脚本会自动判断服务是否已在运行：没运行就先启动，然后调用系统默认浏览器打开 `http://localhost:3000`，你不需要记端口。

### 方式 1：直接运行（最简单）

```bash
cd hello-world-nodejs
node server.js
```

### 方式 2：使用 npm 脚本

```bash
cd hello-world-nodejs
npm start
```

启动后终端会打印：

```
==================================================
  Hello World 网站已启动
  HTTP   本机访问：http://localhost:3000
  HTTP   局域网访问：http://<本机IP>:3000
  HTTPS  本机访问：https://localhost:3443
  HTTPS  自签名证书：首次访问需点“高级 → 继续前往”
  服务器时间：2026 年 11 月 18 日 星期三 21:32:10
  Node 版本：v22.23.4
  按 Ctrl + C 停止服务
==================================================
```

然后浏览器打开：<http://localhost:3000>

### 方式 3：开发模式（改代码自动重启，Node 18+）

```bash
npm run dev
```

### 方式 4：HTTPS 模式（可选，默认 3443 端口）

服务**默认识别证书并自动开启 HTTPS**，不改任何代码。首次使用先生成自签名证书：

```bash
cd hello-world-nodejs

# 1) 生成证书（写到 certs/ 目录，一次即可，有效期 825 天）
npm run cert
# 等价于
bash scripts/gen-cert.sh

# 2) 启动服务（HTTP 3000 + HTTPS 3443 同时可用）
npm start

# 3) 直接打开 HTTPS 地址
npm run open:https
# 等价于
bash scripts/start.sh --https
```

访问地址：**<https://localhost:3443>**

首次打开会看到「您的连接不是私密连接」（自签名证书的正常现象），点 **高级 → 继续前往 localhost（不安全）** 即可，之后同一次浏览器会话不再提示。

相关环境变量：

```bash
HTTPS_PORT=8443 node server.js   # 改 HTTPS 端口
HTTPS=0 node server.js           # 关闭 HTTPS，只跑 HTTP
```

> 为什么是 3443 而不是 443：443 属于 1024 以下的特权端口，绑定需要 root/管理员权限；3443 是普通端口，任何账号都能监听，功能和加密效果与 443 完全一致（只是地址上要带端口号）。

### 换端口

端口默认 3000，可用环境变量覆盖：

```bash
# macOS / Linux
PORT=8080 node server.js

# Windows PowerShell
$env:PORT=8080; node server.js

# Windows CMD
set PORT=8080 && node server.js
```

## 四、路由说明

| 方法 | 路径         | 说明                                                     |
| ---- | ------------ | -------------------------------------------------------- |
| GET  | `/`          | 首页：Hello World! + 当前服务器时间                       |
| GET  | `/api/time`  | 返回服务器时间的 JSON，前端每秒轮询该接口                 |
| GET  | `/style.css` | 页面样式文件（public 目录下的静态资源统一由服务端返回）     |
| 其他 | `*`          | 404 页面                                                  |

接口返回示例（`GET /api/time`）：

```json
{
  "ok": true,
  "text": "2026 年 11 月 18 日 星期三 21:23:05",
  "dateText": "2026 年 11 月 18 日",
  "weekday": "星期三",
  "timeText": "21:23:05",
  "iso": "2026-11-18 21:23:05",
  "timeZone": "UTC+8 (Asia/Shanghai)",
  "timestamp": 1795006985000,
  "uptime": "0 天 00:00:12",
  "serverStartAt": "2026 年 11 月 18 日 星期三 21:22:53",
  "nodeVersion": "v22.23.4",
  "pid": 12345
}
```

## 五、实现要点

1. **零依赖**：只用 `node:http`、`node:https`、`node:fs`、`node:path` 内置模块，不引入 Express 等框架。
2. **服务端渲染兜底**：`index.html` 中的 `__SERVER_TIME__` 等占位符在响应前被替换为真实时间，因此即使浏览器禁用 JavaScript，也能看到服务器时间。
3. **前端实时刷新**：页面每 1 秒请求 `/api/time` 更新时钟；网络中断时状态变为「连接中断」，并在本地延续计时，不会让时钟停住。
4. **时区统一**：服务端固定按 UTC+8（北京时间）换算，服务器部署在任何时区，页面显示都一致。
5. **安全处理**：路径经过 `path.normalize` 与 `startsWith` 校验，防止 `../` 目录穿越；只允许 GET / HEAD；非 GET/HEAD 返回 405。
6. **友好错误**：端口占用（EADDRINUSE）、无权限（EACCES，如绑 80/443）时给出明确提示并按规范退出；`SIGINT/SIGTERM` 时优雅关闭并清理 PID 文件。
7. **HTTP/HTTPS 双栈同一处理器**：两个服务共用同一个 `handleRequest`，页面里的 `fetch('/api/time')` 是相对路径，HTTP 和 HTTPS 下都自动跟随当前协议，无需改前端代码。
8. **HTTPS 可选且自动降级**：`certs/` 下没有证书时不会报错，直接只跑 HTTP；设置了 `HTTPS=0` 也会关闭 HTTPS。
9. **精确进程管理**：启动时把 PID 写入 `.run/server.pid`，`npm run stop` 只停本项目进程，不会误杀同名的其他进程。

## 六、常见问题

**Q：`https://localhost` 还是打不开（「拒绝了我们的连接请求」）？**

`https://localhost` 省略端口时用的是 **443**，而本项目 HTTPS 监听在 **3443**，所以地址必须写全：**<https://localhost:3443>**。

之所以不直接占用 443：绑定 1024 以下的端口需要 root/管理员权限，普通账号会报 `EACCES`（本项目在 `uid=1234` 的普通账号上实测无法绑定）。若你就是想要免端口号的 `https://localhost`，需要 `sudo` 启动、准备证书、并把 `HTTPS_PORT` 设为 443；自签名证书仍会有一次「继续前往」的提示。

另外提醒：HTTP 版本是 **<http://localhost:3000>**（http + 3000），HTTPS 版本是 **https://localhost:3443**，两者端口和协议都不相同，不能混写。

**Q：浏览器提示「您的连接不是私密连接」怎么办？**

这是自签名证书的正常表现，说明加密已经生效，只是证书没有被系统信任。点 **高级 → 继续前往 localhost（不安全）** 即可正常访问，同一浏览器会话内不再重复提示。

想彻底去掉警告，可以装 `mkcert` 生成本机受信任的证书（会把本地 CA 装进系统/浏览器信任库），然后把生成的两个文件覆盖到 `certs/localhost-key.pem` 和 `certs/localhost-cert.pem` 即可，代码不用改。

**Q：端口 3000 被占用怎么办？**
用 `PORT=8080 node server.js` 换端口，或找出占用进程后关闭（macOS/Linux：`lsof -i :3000`）。

**Q：想让同一局域网的手机 / 同学访问？**
服务默认监听 `0.0.0.0`，用电脑局域网 IP（如 `http://192.168.1.10:3000`）即可访问；云服务器需在安全组放行对应端口。

**Q：时间显示的不是我电脑的时间？**
页面显示的是**服务器时间**，不是浏览器所在设备的时间，这正是需求第 2 条的目的。若你希望改成本机时间，可把 `server.js` 中 `getServerTime` 的时间偏移改为 `new Date()` 的本地时区输出。

**Q：部署到服务器（PM2 常驻）？**

```bash
npm i -g pm2
pm2 start server.js --name hello-world
pm2 status
pm2 logs hello-world
```

## 七、停止服务

- 前台运行时：终端按 `Ctrl + C`
- 后台运行时：`npm run stop`（读取 `.run/server-3000.pid`，只停止本项目 3000 端口实例）
- 其他端口实例：`PORT=8080 bash scripts/stop.sh`

## 八、路由说明补充（HTTPS）

HTTP 与 HTTPS 共用同一套路由，把协议和端口换掉即可：

| 访问地址 | 协议 | 端口 | 说明 |
| --- | --- | --- | --- |
| `http://localhost:3000/` | HTTP | 3000 | 默认入口，无需证书 |
| `https://localhost:3443/` | HTTPS | 3443 | 自签名证书，首次需点「继续前往」 |
| `https://localhost:3443/api/time` | HTTPS | 3443 | 加密链路下的时间接口 |
