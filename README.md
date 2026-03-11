# 🚀 ShareFlow

跨设备在线分享，支持文本和文件传输。

## 功能

- 📝 **文本传输** — Markdown 渲染 + 代码高亮 + 一键复制
- 📁 **文件传输** — 点击选择 / 拖拽 / Ctrl+V 粘贴截图
- 📊 **上传进度** — 实时进度条显示
- 🖼️ **图片缩略图** — 自动预览图片文件
- 📱 **PWA 支持** — 移动端可添加到主屏幕
- ⚙️ **可配置** — 文件大小、文本长度限制

## 部署方式

### 1. 本地部署

```bash
# 安装依赖
npm install

# 开发模式（前后端热重载）
npm run dev

# 生产部署
npm run build
npm start
```

环境变量：

| 变量              | 默认值   | 说明                 |
| ----------------- | -------- | -------------------- |
| `PORT`            | 3000     | 服务端口             |
| `DATA_DIR`        | ./data   | 数据存储目录         |
| `MAX_FILE_SIZE`   | 10485760 | 最大文件大小 (bytes) |
| `MAX_TEXT_LENGTH` | 100000   | 最大文本长度 (chars) |

---

### 2. Docker 部署

```bash
# 构建并启动
docker compose up -d

# 或手动构建
docker build -t shareflow .
docker run -d -p 3000:3000 -v shareflow_data:/data shareflow
```

---

### 3. Cloudflare Workers 部署

#### 前置条件

- [Cloudflare 账号](https://dash.cloudflare.com)
- 安装 [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

#### 步骤

```bash
# 1. 登录 Cloudflare
npx wrangler login

# 2. 创建 D1 数据库
npx wrangler d1 create shareflow-db

# 3. 将返回的 database_id 填入 wrangler.toml

# 4. 初始化数据库
npx wrangler d1 execute shareflow-db --file=./schema.sql

# 5. 创建 R2 存储桶
npx wrangler r2 bucket create shareflow-files

# 6. 构建前端
npm run build

# 7. 部署
npm run deploy
```

#### 配置说明

编辑 `wrangler.toml`：

```toml
[vars]
MAX_FILE_SIZE = "10485760"      # 10MB
MAX_TEXT_LENGTH = "100000"       # 100k chars

[[d1_databases]]
database_id = "YOUR_D1_DATABASE_ID"  # 替换为实际 ID

[[r2_buckets]]
bucket_name = "shareflow-files"
```

---

## 技术栈

| 层级     | 技术                       |
| -------- | -------------------------- |
| 前端     | Vue 3 + Vite + PWA         |
| 渲染     | markdown-it + highlight.js |
| 后端     | Hono (TypeScript)          |
| 数据库   | D1 / SQLite                |
| 文件存储 | R2 / 本地文件系统          |

## License

MIT
