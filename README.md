# DAO 争议仲裁服务 (Dispute Arbitration Subservice)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green.svg)](https://nodejs.org/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-orange.svg)](https://soliditylang.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> 基于区块链的去中心化争议仲裁系统，为 Agent 平台提供公平、透明的争议解决方案

## 📋 目录

- [功能特性](#-功能特性)
- [系统架构](#-系统架构)
- [快速开始](#-快速开始)
- [开发指南](#-开发指南)
- [API 文档](#-api-文档)
- [测试报告](#-测试报告)
- [部署指南](#-部署指南)
- [技术栈](#-技术栈)

---

## ✨ 功能特性

### 核心功能
- ✅ **链上争议创建** - 去中心化、不可篡改的争议记录
- ✅ **ERC20 投票机制** - 基于代币余额的投票资格验证
- ✅ **自动裁决系统** - 到期自动结算，平票支持 User
- ✅ **事件索引** - 实时同步链上投票事件到数据库
- ✅ **Webhook 回调** - 争议结算后自动通知 Agent 平台
- ✅ **HMAC 认证** - 确保 API 请求安全性
- ✅ **幂等性保证** - 防止重复创建争议

### 技术亮点
- 🔐 **HMAC-SHA256 签名认证** - 防重放攻击、时间窗口验证
- 🔄 **并发安全** - 两阶段提交策略，利用数据库唯一约束
- 📊 **Checkpoint 持久化** - Indexer 支持断点续传
- 🔁 **指数退避重试** - Webhook 回调失败自动重试
- ⚡ **灵活的投票资格** - 支持多代币、自定义最低余额

### 已测试功能（2026-01-19）
- ✅ 完整 E2E 流程（创建→投票→结算→回调）
- ✅ Indexer 链上事件扫描
- ✅ Checkpoint 持久化机制
- ✅ API 端点响应正确性
- ✅ 资源使用健康检查

---

## 🏗️ 系统架构

```
┌─────────────────┐
│  Agent Platform │ ─── HMAC Auth ──▶ ┌──────────────┐
└─────────────────┘                   │  DAO Service │
                                      │   (NestJS)   │
        ┌──────────────────────────────┤              │
        │                              │  - API       │
        │                              │  - Worker    │
        │                              └──────┬───────┘
        │                                     │
        │                                     ▼
        │                              ┌─────────────┐
        │                              │  PostgreSQL │
        │                              │  + Prisma   │
        │                              └─────────────┘
        │
        ▼
┌────────────────────┐
│  Blockchain (EVM)  │
│                    │
│  - DisputeVoting   │ ◀── Indexer 扫描事件
│  - MockERC20       │
└────────────────────┘
        │
        │ Votes
        ▼
┌─────────────┐
│   Users     │
│  (Wallet)   │
└─────────────┘
```

### 组件说明

| 组件 | 技术栈 | 职责 |
|------|--------|------|
| **DAO Service** | NestJS + Prisma | API 服务、争议管理 |
| **Worker** | NestJS | 事件索引、自动结算、回调 |
| **DisputeVoting** | Solidity 0.8.20 | 链上投票、裁决逻辑 |
| **Indexer** | TypeScript + ethers.js | 扫描链上事件、同步数据库 |
| **Finalizer** | Cron Job | 定时检查到期争议、触发结算 |
| **Callback** | HTTP Client | Webhook 通知、重试机制 |

---

## 📁 项目结构

```
dao-dispute-arbitration-subservice/
├── apps/
│   └── dao-service/              # DAO 服务主应用
│       ├── src/
│       │   ├── auth/            # HMAC 认证模块
│       │   ├── callbacks/       # Webhook 回调处理
│       │   ├── chain/           # 区块链交互层
│       │   ├── config/          # 配置管理
│       │   ├── disputes/        # 争议业务逻辑
│       │   ├── finalizer/       # 自动结算服务
│       │   ├── indexer/         # 链上事件索引
│       │   ├── prisma/          # 数据库客户端
│       │   ├── worker/          # Worker 启动器
│       │   ├── main.ts          # API 服务入口
│       │   └── worker.ts        # Worker 入口
│       └── prisma/
│           ├── schema.prisma    # 数据库模型
│           └── migrations/      # 数据库迁移
├── contracts/
│   └── hardhat/                 # 智能合约
│       ├── contracts/
│       │   ├── DisputeVoting.sol    # 投票合约
│       │   └── MockERC20.sol        # 测试代币
│       ├── test/                    # 合约测试
│       ├── scripts/deploy.ts        # 部署脚本
│       └── deployments/             # 部署记录
├── docs/                        # 文档
│   ├── API-DOCUMENTATION.md         # 完整 API 文档
│   ├── QUICK-START-INTEGRATION.md   # 快速集成指南
│   ├── LOCAL-TEST-REPORT.md         # 测试报告
│   ├── DEPLOYMENT-CHECKLIST.md      # 部署清单
│   └── HMAC.md                      # 认证说明
├── scripts/                     # 辅助脚本
│   ├── e2e/                         # E2E 测试
│   └── manual-e2e-test.js           # 手动测试脚本
├── docker-compose.yml           # Docker 编排
├── .env.example                 # 环境变量示例
└── pnpm-workspace.yaml          # Monorepo 配置
```

---

## 🚀 快速开始

### 环境要求

- **Node.js**: v22.x
- **pnpm**: v8.x
- **Docker**: 最新版本
- **PostgreSQL**: 14+ (Docker 提供)

### 1. 克隆项目

   ```bash
git clone <repository-url>
   cd dao-dispute-arbitration-subservice
   ```

### 2. 切换 Node 版本

⚠️ **重要**: 必须先切换到 Node 22

   ```bash
   nvm install    # 自动读取 .nvmrc 并安装 Node 22
   nvm use        # 切换到 Node 22
node --version # 应显示 v22.x.x
```

### 3. 安装依赖

```bash
pnpm install
```

### 4. 启动本地环境

#### 方式一：一键启动（推荐）

```bash
# 自动启动 Hardhat、部署合约、启动服务
pnpm e2e:dao

# 保留运行环境（不自动清理）
E2E_KEEP=1 pnpm e2e:dao
```

#### 方式二：手动启动

**步骤 1**: 启动 Hardhat 节点
```bash
pnpm --filter contracts-hardhat run node
```

**步骤 2**: 部署合约（新终端）
```bash
pnpm --filter contracts-hardhat run deploy:localhost
```

**步骤 3**: 配置环境变量
```bash
cp .env.example .env
# 编辑 .env，填入 deployments/localhost.json 中的合约地址
```

**步骤 4**: 启动服务
```bash
docker compose up
```

### 5. 验证服务

```bash
# 检查 API 可用性
curl http://localhost:3001/v1/disputes

# 应返回 JSON 数组 (200 OK)
```

---

## 🛠️ 开发指南

### 常用命令

```bash
# 编译所有项目
pnpm build

# 运行合约测试
pnpm --filter contracts-hardhat test

# 编译合约
pnpm --filter contracts-hardhat compile

# 编译服务
pnpm --filter dao-service build

# 运行 E2E 测试
pnpm e2e:dao

# 手动测试脚本
node scripts/manual-e2e-test.js
```

### 数据库操作

```bash
# 进入 dao-service 目录
cd apps/dao-service

# 生成 Prisma Client
npx prisma generate

# 创建迁移
npx prisma migrate dev --name your_migration_name

# 应用迁移
npx prisma migrate deploy

# 查看数据库
npx prisma studio
```

### Docker 操作

```bash
# 启动所有服务
docker compose up

# 后台运行
docker compose up -d

# 查看日志
docker compose logs -f dao-service
docker compose logs -f dao-worker

# 重启服务
docker compose restart dao-worker

# 停止所有服务
docker compose down

# 重建并启动
docker compose up --build
```

---

## 📚 API 文档

### 核心端点

| 端点 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/v1/disputes` | POST | ✅ | 创建争议 |
| `/v1/disputes` | GET | ❌ | 查询争议列表 |
| `/v1/disputes/:id` | GET | ❌ | 查询单个争议 |
| `/v1/disputes/:id/force-finalize` | POST | ✅ | 强制结算 |

### 详细文档

- 📖 **[完整 API 文档](./docs/API-DOCUMENTATION.md)** - 包含所有端点、请求/响应格式、错误码
- 🚀 **[快速集成指南](./docs/QUICK-START-INTEGRATION.md)** - Agent 平台接入指南
- 🔐 **[HMAC 认证说明](./docs/HMAC.md)** - 签名算法详解

### 快速示例

```javascript
const crypto = require('crypto');

// 创建争议
const disputeData = {
  platformDisputeId: `platform-${Date.now()}`,
  jobId: 'job-001',
  billId: 'bill-001',
  agentId: 'agent-001',
  initiator: 'user',
  reason: 'Agent 未完成任务'
};

// HMAC 签名
const timestamp = Math.floor(Date.now() / 1000).toString();
const nonce = crypto.randomBytes(16).toString('hex');
const rawBody = JSON.stringify(disputeData);
const payload = `${timestamp}.${nonce}.${rawBody}`;
const signature = crypto.createHmac('sha256', HMAC_SECRET)
  .update(payload).digest('hex');

// 发送请求
fetch('http://localhost:3001/v1/disputes', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-signature': signature,
    'x-timestamp': timestamp,
    'x-nonce': nonce
  },
  body: rawBody
});
```

---

## 🧪 测试报告

### 最新测试结果（2026-01-19）

**测试状态**: ✅ 23/30 项测试通过

| 测试阶段 | 状态 | 通过率 |
|----------|------|--------|
| 环境准备 | ✅ | 4/4 |
| 代码质量 | ✅ | 2/3 |
| 数据库迁移 | ✅ | 6/6 |
| 合约测试 | ✅ | 1/1 |
| E2E 流程 | ✅ | 9/9 |
| 新功能专项 | ⏸️ | 1/5 |
| 手动验证 | ✅ | 4/4 |
| 性能稳定性 | ✅ | 2/2 |

### 已验证功能

- ✅ 创建争议 → 链上创建成功
- ✅ 投票 → Agent 和 User 投票成功
- ✅ Force Finalize → 争议结算成功
- ✅ Webhook 回调 → 回调发送成功
- ✅ Indexer 扫描 → 事件正确索引到数据库
- ✅ Checkpoint 持久化 → 重启后正确恢复
- ✅ API 端点 → 响应正确
- ✅ 资源使用 → 健康（无内存泄漏）

### 详细报告

查看完整测试报告：[docs/LOCAL-TEST-REPORT.md](./docs/LOCAL-TEST-REPORT.md)

---

## 🚢 部署指南

### 部署检查清单

详细的部署步骤和检查清单：[docs/DEPLOYMENT-CHECKLIST.md](./docs/DEPLOYMENT-CHECKLIST.md)

### 快速部署（生产环境）

1. **部署合约到 Sepolia 测试网**
   ```bash
   pnpm --filter contracts-hardhat run deploy:sepolia
   ```

2. **配置环境变量**
   ```bash
   # 在生产服务器上配置
   CHAIN_ID=11155111
   RPC_URL=<your-sepolia-rpc>
   VOTING_CONTRACT=<deployed-address>
   TOKEN_CONTRACT=<token-address>
   DATABASE_URL=<postgres-url>
   HMAC_SECRET=<secure-secret>
   ```

3. **启动服务**
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

---

## 🔧 技术栈

### 后端服务
- **框架**: NestJS 10.x
- **语言**: TypeScript 5.x
- **数据库**: PostgreSQL 14+ (Prisma ORM)
- **区块链交互**: ethers.js 6.x

### 智能合约
- **语言**: Solidity 0.8.20
- **框架**: Hardhat
- **测试**: Hardhat + Chai

### DevOps
- **容器化**: Docker + Docker Compose
- **包管理**: pnpm (Monorepo)
- **版本管理**: Git

### 关键依赖
```json
{
  "@nestjs/common": "^10.0.0",
  "ethers": "^6.16.0",
  "prisma": "^5.22.0",
  "zod": "^3.22.4"
}
```

---

## 📖 相关文档

| 文档 | 说明 |
|------|------|
| [API-DOCUMENTATION.md](./docs/API-DOCUMENTATION.md) | 完整 API 接口文档 |
| [QUICK-START-INTEGRATION.md](./docs/QUICK-START-INTEGRATION.md) | 快速集成指南 |
| [LOCAL-TEST-REPORT.md](./docs/LOCAL-TEST-REPORT.md) | 本地测试报告 |
| [DEPLOYMENT-CHECKLIST.md](./docs/DEPLOYMENT-CHECKLIST.md) | 部署检查清单 |
| [HMAC.md](./docs/HMAC.md) | HMAC 认证说明 |
| [Agent.md](./Agent.md) | 开发里程碑记录 |

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 开发流程

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request


---

**最后更新**: 2026-01-19  
**版本**: v1.0.0
