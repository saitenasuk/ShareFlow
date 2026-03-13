# 🚀 ShareFlow

通过浏览器快速分享文本和文件

## 功能

- 📝 **文本传输** — 发送纯文本，一键复制
- 📁 **文件传输** — 点击选择 / 拖拽 / Ctrl+V 粘贴截图
- 📊 **上传进度** — 实时进度条显示
- 🖼️ **图片缩略图** — 自动预览图片文件
- 🔗 **链接分享** — 将任意记录生成独立分享链接
  - 🔒 访问密码保护
  - ⏳ 自定义过期时间（5 分钟 ~ 30 天）
  - 👁️ 限制最大查看次数
  - 🗑️ 过期后自动删除原记录
- 📱 **PWA 支持** — 移动端可添加到主屏幕，支持左右滑动切换标签
- ⚙️ **可配置** — 文件大小、文本长度限制，可设置访问密码

## 部署方式

### 1. 本地部署

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产部署
npm run build
npm start
```

环境变量：

| 变量              | 默认值   | 说明                     |
| ----------------- | -------- | ------------------------ |
| `PORT`            | 3000     | 服务端口                 |
| `DATA_DIR`        | ./data   | 数据存储目录             |
| `MAX_FILE_SIZE`   | 26214400 | 最大文件大小 (bytes)     |
| `MAX_TEXT_LENGTH` | 100000   | 最大文本长度             |
| `AUTH_PASSWORD`   | 无       | 访问密码（留空则不需要） |

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

# 3. 初始化数据库
npx wrangler d1 execute shareflow-db --file=./schema.sql

# 4. 创建 R2 存储桶
npx wrangler r2 bucket create shareflow-files

# 5. 设置访问密码(可选)
npx wrangler secret put AUTH_PASSWORD

# 6. 构建前端
npm run build

# 7. 部署
npm run deploy
```

#### 配置说明

编辑 `wrangler.toml`：

```toml
[vars]
MAX_FILE_SIZE = "26214400"      # 25MB
MAX_TEXT_LENGTH = "100000"      # 100k chars

[[r2_buckets]]
bucket_name = "shareflow-files"
```

---

## 技术栈

| 层级     | 技术               |
| -------- | ------------------ |
| 前端     | Vue 3 + Vite + PWA |
| 后端     | Hono (TypeScript)  |
| 数据库   | D1 / SQLite        |
| 文件存储 | R2 / 本地文件系统  |

## License

MIT
