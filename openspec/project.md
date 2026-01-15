# 项目上下文

## Purpose

DAO 争议仲裁子服务（DAO Dispute Arbitration Subservice）是一个为 Agent 平台提供链上争议创建、投票、裁决和回调功能的去中心化仲裁系统。

**核心目标**：
- Agent 平台通过 API 创建争议，DAO Service 将争议写入链上合约
- 用户通过钱包直接向合约投票，合约基于 ERC20 余额阈值强制执行投票资格
- 服务端索引链上事件到 PostgreSQL，定时任务自动 finalize 到期争议
- 通过 Webhook 回调将最终结果通知 Agent 平台

**V1 设计原则**：
- 简单优先：无快照/锁定/加权投票机制
- 去中心化：不托管用户私钥，用户直接与合约交互
- 链上验证：投票资格在合约层强制执行

## 技术栈

### 前端/合约层
- **Solidity 0.8.20**：智能合约开发
- **Hardhat**：合约开发、测试、部署框架
- **ethers v6**：链交互库

### 服务端
- **NestJS**：Node.js 框架（模块化架构）
- **TypeScript 5.3+**：类型安全
- **Prisma**：ORM 和数据库迁移
- **PostgreSQL**：关系型数据库

### 基础设施
- **pnpm workspaces**：Monorepo 管理
- **Docker + Docker Compose**：容器化部署
- **Node.js 22+**：运行时环境

### 工具链
- **zod**：环境变量和配置验证
- **ts-node**：TypeScript 直接执行

## 项目约定

### 代码风格

- **TypeScript 配置**：
  - `strict: true`（严格模式）
  - `target: ES2020`
  - `module: CommonJS`
  - `esModuleInterop: true`

- **命名约定**：
  - 文件：kebab-case（`disputes.service.ts`）
  - 类/接口：PascalCase（`DisputesService`）
  - 变量/函数：camelCase（`createDispute`）
  - 常量：UPPER_SNAKE_CASE（`MAX_DRIFT_SECONDS`）

- **代码组织**：
  - NestJS 模块化：每个功能域一个模块（`DisputesModule`、`ChainModule` 等）
  - 单一职责：每个服务/控制器专注单一功能
  - 依赖注入：使用 NestJS DI 容器

- **格式化**：
  - 使用项目默认的 TypeScript 格式化规则
  - 保持一致的缩进（2 空格）

### 架构模式

**Monorepo 结构**：
```
repo-root/
  apps/
    dao-service/          # NestJS 服务应用
  contracts/
    hardhat/              # Hardhat 合约项目
  packages/
    shared/               # 共享代码（可选）
  infra/
    docker/               # Docker 相关配置
```

**服务端架构**：
- **模块化设计**：按功能域划分模块
  - `ConfigModule`：配置管理（环境变量验证）
  - `PrismaModule`：数据库访问
  - `DisputesModule`：争议管理 API
  - `ChainModule`：链交互服务
  - `CallbacksModule`：Webhook 回调处理
  - `AuthModule`：HMAC 认证
  - `WorkerModule`：后台任务（索引器、定时器）

- **分层架构**：
  - Controller：HTTP 请求处理
  - Service：业务逻辑
  - Prisma：数据访问层

- **Worker 模式**：
  - 独立进程运行索引器和定时任务
  - 与 API 服务分离，避免阻塞

**合约架构**：
- 单一合约：`DisputeVoting.sol` 包含所有投票逻辑
- 接口分离：`IERC20Balance` 用于余额查询
- 不可变参数：`token`、`minBalance`、`voteDurationSeconds` 在构造时设置

### 测试策略

**合约测试**：
- 使用 Hardhat 测试框架
- 位置：`contracts/hardhat/test/`
- 命令：`pnpm --filter contracts-hardhat test`
- 覆盖：投票规则、资格校验、裁决逻辑

**E2E 测试**：
- 脚本：`scripts/e2e/dao-e2e.js`
- 命令：`pnpm e2e:dao`
- 流程：启动 Hardhat → 部署合约 → 启动服务 → 创建争议 → 投票 → 验证结果

**手动验证**：
- 文档：`docs/MANUAL-VERIFY.md`
- 用于：部署前验证、问题排查

**测试要求**：
- 新功能必须包含测试
- 关键业务逻辑（投票、裁决）必须有单元测试
- E2E 测试覆盖主要流程

### Git 工作流

**分支策略**：
- `main`：生产就绪代码
- 功能分支：`feature/xxx` 或直接提交到 main（根据团队约定）

**提交约定**：
- 使用清晰的提交信息
- 关联 Issue/PR（如有）

**文件排除**：
- `.env` 文件（包含敏感信息）
- `node_modules/`、`dist/`、`build/`
- Hardhat 编译产物（`artifacts/`、`cache/`）
- 本地部署文件（`deployments/localhost.json`）

## 领域上下文

### DAO 争议仲裁流程

1. **争议创建**：
   - Agent 平台调用 `POST /v1/disputes`（HMAC 认证）
   - DAO Service 验证签名，创建链上争议（`createDispute`）
   - 返回 `contractDisputeId` 和 `deadline`

2. **投票阶段**：
   - 用户通过钱包直接调用合约 `vote(disputeId, choice)`
   - 合约验证：ERC20 余额 >= `minBalance`
   - 合约记录投票并发出 `Voted` 事件

3. **事件索引**：
   - Worker 索引器监听链上事件（`DisputeCreated`、`Voted`、`DisputeFinalized`）
   - 写入 PostgreSQL（`Dispute`、`Vote` 表）
   - 幂等处理：避免重复索引

4. **自动裁决**：
   - Finalizer 定时任务检查到期争议
   - 调用合约 `finalize(disputeId)`
   - 更新数据库状态为 `RESOLVED`

5. **回调通知**：
   - Callback 处理器发送 Webhook 到 Agent 平台
   - 包含：`status`、`result`、`votesAgent`、`votesUser`、`finalizeTxHash`
   - 重试机制：指数退避，最终标记为 `FAILED`

### 关键概念

- **平台争议 ID**（`platformDisputeId`）：Agent 平台的唯一标识，用于幂等
- **合约争议 ID**（`contractDisputeId`）：链上的争议编号（uint256）
- **投票选择**（`choice`）：1 = 支持 Agent，2 = 支持 User
- **裁决结果**（`result`）：`SUPPORT_AGENT` 或 `SUPPORT_USER`（平票支持 User）
- **投票资格**：持有 ERC20 token 余额 >= `minBalance`

### HMAC 认证

- **签名算法**：HMAC-SHA256
- **Payload 格式**：`${timestamp}.${nonce}.${rawBody}`
- **时间窗口**：±300 秒
- **Nonce 防重放**：内存存储，过期自动清理

## 重要约束

### 技术约束

1. **不托管私钥**：
   - DAO Service 不持有用户私钥
   - 用户必须通过钱包直接与合约交互
   - `SIGNER_PRIVATE_KEY` 仅用于 `force-finalize`（管理员功能）

2. **链上验证**：
   - 投票资格必须在合约层验证（`vote()` 函数内）
   - 服务端不信任客户端，所有关键逻辑在链上

3. **V1 简化**：
   - 无快照机制（基于当前余额）
   - 无锁定机制（投票后 token 可转移）
   - 无加权投票（一票一权）

4. **Monorepo 结构**：
   - 合约必须在 `contracts/hardhat/`
   - 服务必须在 `apps/dao-service/`
   - 不允许嵌套结构

### 业务约束

1. **幂等性**：
   - 相同 `platformDisputeId` 的重复创建返回已有记录
   - 事件索引必须幂等（避免重复写入）

2. **时间同步**：
   - HMAC 时间戳验证要求服务器时间准确
   - 建议使用 NTP 同步

3. **回调可靠性**：
   - Webhook 回调失败需要重试
   - 最终失败需要标记状态，便于人工处理

### 安全约束

1. **环境变量**：
   - `.env` 文件不得提交到 Git
   - 生产环境使用 Secrets Manager 或环境变量注入

2. **HMAC 密钥**：
   - 与 Agent 平台共享的密钥必须强随机
   - 生产环境使用不同的密钥

3. **RPC 访问**：
   - 使用受信任的 RPC 提供商（Infura、Alchemy）
   - 考虑 RPC 限流和故障转移

## 外部依赖

### 区块链网络

- **Sepolia 测试网**：
  - Chain ID: 11155111
  - RPC 提供商：Infura、Alchemy 等
  - 用途：生产环境部署

- **本地 Hardhat 网络**：
  - Chain ID: 31337
  - 用途：开发、测试、E2E

### 数据库

- **PostgreSQL**：
  - 版本：15+
  - 用途：争议数据、投票记录、事件索引状态
  - 部署：RDS（生产）或 Docker（本地）

### 外部服务

- **Agent 平台**：
  - Webhook 回调地址：`PLATFORM_WEBHOOK_URL`
  - HMAC 密钥共享：`HMAC_SECRET`
  - 协议：HTTPS（生产环境）

### 开发工具

- **Hardhat**：合约开发框架
- **Prisma**：数据库 ORM 和迁移工具
- **Docker**：容器化部署

## 部署环境

### 本地开发
- Hardhat 本地节点：`http://127.0.0.1:8545`
- Docker Compose：PostgreSQL + Webhook 接收器
- 环境文件：`.env`（从 `.env.example` 复制）

### 生产环境
- EC2：Ubuntu 22.04 或 Amazon Linux 2
- RDS PostgreSQL：托管数据库
- Sepolia 测试网：合约部署目标
- Docker Compose：仅运行 `dao-service` 和 `dao-worker`

详细部署步骤见：`docs/DEPLOY-EC2.md`
