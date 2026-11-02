# 企业知识问答助手（Knowledge QA Assistant）

基于 **Turborepo monorepo** 的企业级 RAG 问答系统：员工上传文档 → 切分向量化存入 **Milvus** → 提问时检索相关分块，交给 **LangChain** 编排的大模型生成回答并附引用来源。

## 技术栈

| 层        | 选型                                                                          |
| --------- | ----------------------------------------------------------------------------- |
| Monorepo  | pnpm workspace + Turborepo                                                    |
| 前端      | Next.js 15 (App Router) + React 19                                            |
| UI        | Tailwind CSS 4 + shadcn 风格组件 + lucide-react                               |
| 状态/数据 | Zustand（客户端 UI 状态）+ TanStack Query（服务端数据）                       |
| AI 编排   | LangChain.js（ChatOpenAI 兼容协议，可接 OpenAI / DeepSeek / Ollama 本地模型） |
| 向量库    | Milvus standalone                                                             |
| 关系库    | PostgreSQL 16 + Drizzle ORM                                                   |
| 认证      | 独立 auth 子应用 + JWT + 父域名共享 Cookie                                    |
| 基础设施  | docker-compose                                                                |

## 目录结构

```
knowledge-qa-assistant/
├── apps/
│   ├── web/                  # 主应用  app.lvh.me:6101（问答/知识库/模型设置）
│   └── auth/                 # 认证中心 auth.lvh.me:6100（注册/登录/退出）
├── packages/
│   ├── ui/                   # @kqa/ui        shadcn 风格组件 + 主题 tokens
│   ├── db/                   # @kqa/db        Drizzle schema + 连接客户端
│   ├── auth/                 # @kqa/auth      JWT 会话协议（签发/校验/cookie 约定）
│   ├── ai/                   # @kqa/ai        LangChain 封装：模型初始化/入库/RAG
│   └── tsconfig/             # @kqa/tsconfig  共享 TS 配置
├── docker-compose.yml        # postgres + etcd + minio + milvus + attu
└── turbo.json
```

## 别名约定

- **包间引用**统一用 workspace 协议 + `@kqa/*` scope（如 `import { Button } from "@kqa/ui/components/button"`），Turborepo 依据它推导任务依赖图
- **app 内部引用**统一 `@/*` → `./src/*`（在各 app 的 tsconfig `paths` 中配置）
- 内部包直接导出 **TS 源码**（`"exports": "./src/*.ts"`），由消费方的 Next.js `transpilePackages` 编译，省去包的构建步骤

## 跨子域名认证原理

```
auth.lvh.me:6100 ──登录成功──> Set-Cookie: kqa_session=<JWT>; Domain=.lvh.me; HttpOnly
                                        │
app.lvh.me:6101 ──proxy.ts 统一校验 JWT──> 服务端独立验证身份与资源权限
```

- cookie 写在**父域名** `.lvh.me` 上，所有子域名共享
- `lvh.me` 是通配 DNS，永远解析到 127.0.0.1，无需改 hosts；生产换成 `.your-domain.com`
- JWT 由 `jose` 用 HS256 签名，密钥 `AUTH_SECRET` 两个 app 共享，auth 与 web 零互调
- Web 的 `proxy.ts` 统一验证会话：页面未登录跳转认证中心，API 未登录返回 JSON 401；框架静态资源及公开图标放行
- 服务端组件、API 路由仍通过 `getSessionUser()` 独立验签，并检查租户、资源归属等业务权限；Proxy 不替代这些校验
- JWT 带标准 claim：`iss=kqa-auth` / `aud=kqa`，验签时一并核对，防止其它系统用同密钥签发的 token 被混用
- `COOKIE_DOMAIN` 有**代码级白名单**（`.lvh.me` / `localhost`），不在白名单内的值直接抛异常，防止配置注入把会话 cookie 写到攻击者域名
- 校验时强制要求 `tenantId` 存在，老版本 token 自动失效、强制重新登录

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 启动基础设施（postgres + etcd + minio + milvus + attu）
pnpm docker:up

# 3. 初始化数据库表结构
pnpm db:generate && pnpm db:migrate

# 4. 配置环境变量
cp .env.example .env   # 修改 AUTH_SECRET 与 LLM/Embedding 的 key

# 5. 同时启动两个 app
pnpm dev
```

访问：

- 主应用：http://app.lvh.me:6101 （如果未登录自动跳转认证中心）
- 认证中心：http://auth.lvh.me:6100
- MinIO 控制台：http://localhost:9001 （minioadmin / minioadmin）
- Attu（Milvus GUI）：http://localhost:8000 → 看向量集合、逐行数据、手动试检索；`docker compose up -d` 自动拉起，详见 [docs/nextjs-monorepo-postgres-milvus-rag.md](docs/nextjs-monorepo-postgres-milvus-rag.md) 第 10 节

## 接入本地模型（如 Ollama）

在 web 应用「模型设置」页填写：

| 字段               | Ollama 示例                                    |
| ------------------ | ---------------------------------------------- |
| LLM Base URL       | `http://localhost:11434/v1`                    |
| LLM API Key        | 任意非空值（本地不校验）                       |
| LLM 模型名         | `qwen3`                                        |
| Embedding Base URL | `http://localhost:11434/v1` 或 bge-m3 服务地址 |
| Embedding 模型名   | `bge-m3`                                       |

配置存 PostgreSQL `model_settings` 表，原样传给 LangChain 的 `ChatOpenAI` / `OpenAIEmbeddings` 初始化，保存即生效。

### ⚠️ Embedding 模型必须是对话模型以外的专用向量化模型

**LLM（如 deepseek-r1、qwen3）不能当 Embedding 模型用**。Ollama 的 `/v1/embeddings` 接口对任何模型都会"强行"返回向量（取 hidden state），表面上接口不报错、向量也写得进 Milvus——但这些向量没有语义检索能力，问"年假怎么休"会召回完全无关的片段，且很难排查。

```bash
# 正确的搭配：LLM 和 Embedding 各拉各的
ollama pull deepseek-r1:7b   # 对话生成
ollama pull bge-m3           # 文本向量化（1024 维，中文语义检索强）
```

```bash
# .env —— 两个配置是独立的，不要填同一个模型
LLM_MODEL=deepseek-r1:7b
EMBEDDING_MODEL=bge-m3
```

**换 Embedding 模型 = 向量维度变化 = 旧向量全部作废**（bge-m3 是 1024 维，text-embedding-3-small 是 1536 维）。切换后需要：

1. Attu（http://localhost:8000）→ Collections → 删除 `kqa_chunks` 集合
2. 对已有文档重新入库（原文存在 PG 的 `source_text`，「重试」按钮即可，无需重新上传文件）
3. **重启 `pnpm dev`**——运行中的进程缓存了启动时的环境变量，不重启的话新配置不生效

验证：Attu → Vector Search 输入问题，top-K 应该命中语义相关的 chunk。

## 数据流

```
上传文档 ──> PG documents 表（元数据，status=pending）──> Redis 队列异步消费
                                                              │
                                    ┌─────────────────────────┘
                                    ▼
                        切分 + embedding ──> Milvus kqa_chunks 集合
                        （metadata 带 tenantId 隔离租户）
                                    │
                        status: pending → processing → ready / failed
                                    │
                        SSE（Redis pub/sub）实时推送状态到前端

提问 ──> Milvus 按 tenantId + 选中文档范围过滤检索 top-4 ──> 拼装 prompt ──> LLM 流式回答 + 引用来源 ──> 落库 messages
```

---

## 企业级功能蓝图（Roadmap）

> 按优先级排序，`✅` 表示已实现，`🔲` 表示待开发。

### 一、知识库与文档管理（数据入口）

| 功能                           | 状态 | 说明                                                                                                                            |
| ------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------- |
| 多格式文档解析                 | ✅   | PDF (pdf-parse) / docx (mammoth) / HTML (cheerio) / MD / TXT，插件式 `extractText()`                                            |
| 异步解析与向量化               | ✅   | 上传即返回（202），Redis List 队列后台串行消费，SSE 推送状态                                                                    |
| 上传进度条                     | ✅   | XMLHttpRequest `upload.onprogress`，0-90% 上传、90-100% 服务端处理                                                              |
| 切块参数可配置                 | 🔲   | 当前固定 800/120 字符，需支持管理员按知识库配置 chunkSize / overlap                                                             |
| 软删除                         | ✅   | `deleted_at` 字段，列表查询自动过滤，同步物理删 Milvus 向量                                                                     |
| 失败重试                       | ✅   | 「重试」按钮调 `POST /api/documents/:id/retry`：先清理上次残留向量，再利用上传时保存的 `source_text` 重新排队，无需重新上传文件 |
| 元数据 JSONB（部门/密级/版本） | 🔲   | 需扩展 `documents` 表加 `metadata jsonb` 字段                                                                                   |
| 审核发布流转                   | 🔲   | 状态机：draft → pending_review → published → archived，仅 published 进检索                                                      |
| 文档模糊搜索                   | 🔲   | PG `ILIKE` 或全文检索实现                                                                                                       |
| OCR（扫描件 PDF）              | 🔲   | 预留扩展点：`extractText()` 的 pdf 分支加 OCR 调用（PaddleOCR / VLM）                                                           |
| 索引重建                       | 🔲   | 需手动触发重新向量化（当前删除后重新上传即可）                                                                                  |

### 二、RAG 检索与生成链路

| 功能                    | 状态 | 说明                                                                                                  |
| ----------------------- | ---- | ----------------------------------------------------------------------------------------------------- |
| 向量检索（语义召回）    | ✅   | Milvus `similaritySearch`，按 `tenantId` 过滤，top-4                                                  |
| 流式生成（SSE）         | ✅   | `/api/chat` 返回 ReadableStream，逐 token 推送给前端                                                  |
| 引用来源展示            | ✅   | 回答附 `{ documentId, filename, chunkIndex }`，前端展示引用卡片                                       |
| 按文档范围检索          | ✅   | 提问时可勾选文档子集，Milvus 过滤条件追加 `documentId in [...]`（空数组则命中"无许可文档"，等于拒答） |
| 混合检索（BM25 + 向量） | 🔲   | 向量路走 Milvus；关键词路用 PG `tsvector` 全文检索，RRF 融合排序                                      |
| Rerank 精排             | 🔲   | 融合后接 BGE Rerank（CPU 可跑），进一步压缩上下文                                                     |
| 拒答机制                | 🔲   | 相似度低于阈值时明确拒答，而不是让 LLM 编造                                                           |
| 多轮对话记忆            | 🔲   | 当前只传当前问题，需加 ConversationSummary 压缩历史                                                   |
| 检索过程可视化          | 🔲   | 调试页展示各阶段召回结果和分数，便于调参                                                              |

### 三、问答交互界面

| 功能             | 状态 | 说明                                                           |
| ---------------- | ---- | -------------------------------------------------------------- |
| 流式输出         | ✅   | SSE 逐字返回，降低感知延迟                                     |
| 多会话管理       | ✅   | 会话列表、切换、历史消息加载                                   |
| 会话重命名       | ✅   | `PATCH /api/conversations/:id`，手动改名（1–200 字符）         |
| 会话置顶         | ✅   | `PATCH /api/conversations/:id` 切换 `pinned`，列表置顶优先排序 |
| 会话删除         | ✅   | `DELETE /api/conversations/:id`，级联清理 messages             |
| 会话搜索         | ✅   | 侧栏搜索框，标题 ILIKE 模糊匹配（转义 `%`/`_`）                |
| 会话 24 小时过期 | 🔲   | 需加定时任务清理过期会话                                       |
| 检索可视化       | 🔲   | 同"二、检索过程可视化"                                         |

### 四、权限、审计与安全

| 功能                             | 状态 | 说明                                                                  |
| -------------------------------- | ---- | --------------------------------------------------------------------- |
| JWT + RBAC                       | ✅   | 角色 `admin` / `member`，JWT payload 携带 `tenantId` / `role`         |
| 租户数据隔离                     | ✅   | 检索时 Milvus `tenantId` 过滤，LLM 上下文里无越权数据                 |
| 模型配置权限                     | ✅   | 仅 admin 可改模型配置（apiKey/baseURL 等）                            |
| 文档可见性（部门/私有/指定角色） | 🔲   | 当前同租户全员可见，需加 `visibility` 字段和过滤逻辑                  |
| 审计日志                         | 🔲   | 需加 `audit_logs` 表，记录问答请求、检索结果、管理操作，支持 CSV 导出 |
| 输入安全                         | ✅   | 文件类型白名单、20MB 大小限制、文件名安全清洗                         |

### 五、管理后台（/admin）

| 功能           | 状态 | 说明                                              |
| -------------- | ---- | ------------------------------------------------- |
| 知识库配置面板 | 🔲   | 切块参数、Embedding 模型选择、top-k / 阈值设置    |
| 文档审核队列   | 🔲   | 待审核列表、通过/驳回操作、并发防重               |
| 索引重建按钮   | 🔲   | 手动触发重新向量化                                |
| 检索调试页     | 🔲   | 输入 query，展示向量召回、BM25、Rerank 各阶段分数 |
| 评估指标       | 🔲   | 内置 50 道标准问题，计算 Hit@k / MRR              |

### 向量存储选型：Milvus vs pgvector

| 维度       | Milvus（本项目选用）           | pgvector                      |
| ---------- | ------------------------------ | ----------------------------- |
| 性能       | 亿级向量，专用索引（HNSW/IVF） | 千万级以内够用                |
| 部署       | 独立服务（etcd + minio）       | PG 插件，零额外组件           |
| 元数据过滤 | 标量字段过滤，表达式强大       | JSONB + WHERE，灵活但性能一般 |
| 适用场景   | 多租户、大规模、高并发         | 中小规模、运维极简            |

本项目选择 Milvus 原因：

- 多租户场景下标量过滤（`tenantId`）性能好
- 与 LangChain `Milvus` 集成成熟，支持 metadata 过滤
- 文章教学价值高（独立向量库 vs PG 插件的架构对比）

**混合检索路线**（Milvus 方案）：向量路走 Milvus `similaritySearch`；关键词路用 PG 全文检索（`tsvector` + `websearch_to_tsquery`）；两路结果在应用层 RRF 融合，最后接 Rerank。

---

## 本地调试指南

### 进入 Docker 查数据库

```bash
# 进入 Postgres 容器（交互式 psql）
docker exec -it kqa-postgres psql -U kqa -d kqa

# 常用 SQL（在 psql 里执行）
\dt                              -- 列出所有表
SELECT * FROM documents;          -- 查看文档（含 status / error 字段）
SELECT * FROM documents WHERE status = 'failed';   -- 只看失败的
SELECT * FROM tenants;
SELECT * FROM tenant_members;

# 不进入容器，直接在宿主机执行单条 SQL
docker exec kqa-postgres psql -U kqa -d kqa -c "SELECT filename, status, error FROM documents;"

# 查 Redis（队列和事件总线）
docker exec -it kqa-redis redis-cli
> llen kqa:document:queue         -- 队列里待处理的任务数
> keys "kqa:document:processing:*"  -- 正在处理的任务锁
> monitor                          -- 实时查看所有 Redis 命令（调试用）
```


或者

在 VS Code 扩展商店搜索 [Database Client](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-database-client2)（图标是一个数据库图案），安装后左侧活动栏会出现数据库图标。

点击插件图标 → 点击 **"Create Connection"** → 选择 **PostgreSQL**，填写：

| 字段     | 值                                                         |
| -------- | ---------------------------------------------------------- |
| Host     | `localhost/127.0.0.1`                                      |
| Port     | `5432`（如果你在 compose 里映射成 5433:5432，这里填 5433） |
| Username | `kqa`                                                      |
| Password | `kqa_password`                                             |
| Database | `kqa`                                                      |

### 文档处理失败怎么排查

文档状态流转：`pending → processing → ready / failed`。失败原因存在 `documents.error` 字段。

**第零步：优先点「重试」按钮**

失败文档支持一键重新入库（`POST /api/documents/:id/retry`），服务端会自动清理上次残留的向量、用上传时保存的原文重新排队。仅当提示"未保存解析文本"的历史文档才需要删除后重新上传。

**第一步：看数据库里的错误信息**

```bash
docker exec kqa-postgres psql -U kqa -d kqa -c \
  "SELECT filename, status, error FROM documents WHERE status='failed' ORDER BY created_at DESC;"
```

常见错误对照表：

| error 内容           | 原因                                                 | 解决办法                               |
| -------------------- | ---------------------------------------------------- | -------------------------------------- |
| `Connection error.`  | 网络连不上模型服务（国内直连 api.openai.com 会被墙） | 换国内可达的 OpenAI 兼容服务，或配代理 |
| `Request timed out.` | 请求超时，可能是代理慢或服务不可用                   | 检查代理，或换 Embedding 服务          |
| `401 Unauthorized`   | API Key 错误或失效                                   | 在「模型设置」页更新 key               |
| `文档解析失败：...`  | 文件格式损坏或加密                                   | 换文件重试                             |
| `未解析出文本内容`   | 扫描件 PDF（图片型），需要 OCR                       | 后续阶段支持 OCR                       |

**第二步：检查模型服务是否可达**

```bash
# 测试 Embedding 服务连通性（以 OpenAI 为例）
curl -s -o /dev/null -w "HTTP %{http_code}\n" --max-time 10 \
  https://api.openai.com/v1/models \
  -H "Authorization: Bearer $YOUR_API_KEY"

# HTTP 000 = 完全连不上（网络被墙 / 无代理）
# HTTP 401 = 连上了但 key 无效
# HTTP 200 = 正常
```

**第三步：看服务端日志**

```bash
# dev server 日志里搜队列消费日志
pnpm dev 2>&1 | grep "\[queue\]"

# 正常应该看到：
# [queue] consumer started, waiting for jobs...
# [queue] job dequeued: {"documentId":"..."}
# [queue] job done: <documentId>
```

### 国内网络环境推荐配置

`api.openai.com` 在国内直连不通（表现为 `Connection error.`）。推荐用**硅基流动（SiliconFlow）**——国内可直接访问，同时提供 LLM 和 Embedding 模型，一个 key 搞定：

```bash
# .env 里改成（或登录后在「模型设置」页配置）
LLM_BASE_URL=https://api.siliconflow.cn/v1
LLM_API_KEY=sk-xxxxxxxx          # 在 https://cloud.siliconflow.cn 申请
LLM_MODEL=Qwen/Qwen2.5-7B-Instruct

EMBEDDING_BASE_URL=https://api.siliconflow.cn/v1
EMBEDDING_API_KEY=sk-xxxxxxxx    # 同一个 key
EMBEDDING_MODEL=BAAI/bge-m3      # 中文 embedding 效果好
```

其他可选：

- **DeepSeek**：`https://api.deepseek.com/v1`（LLM 好，但无 embedding，需另配）
- **本地 Ollama**：`http://localhost:11434/v1`（完全离线，先 `ollama pull bge-m3` 或者 下载 deepseek-r1:7b）
- **OpenAI + 代理**：配置 `HTTPS_PROXY` 环境变量

### 清理测试数据

```bash
# 软删除所有文档（向量不删，后续可手动清）
docker exec kqa-postgres psql -U kqa -d kqa -c \
  "UPDATE documents SET deleted_at = now() WHERE deleted_at IS NULL;"

# 重置整个数据库（会丢所有数据，包括用户）
docker exec kqa-postgres psql -U kqa -d kqa -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
pnpm db:migrate
```
