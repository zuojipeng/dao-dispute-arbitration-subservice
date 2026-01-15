# DAO Dispute Arbitration Subservice (V1)

## 已实现内容
- 使用 pnpm workspaces 的 monorepo 基础结构。
- Hardhat 项目，包含 Mock ERC20 与 DisputeVoting 合约。
- 投票合约基于 ERC20 余额阈值进行资格校验。
- 覆盖投票/最终裁决规则的单测。
- 本地部署脚本与部署清单生成。
- DAO Service 脚手架（NestJS + Prisma），含配置校验与构建脚本。
- DAO Service API（创建/查询争议），含 HMAC guard 与幂等校验。
- 链上事件索引、最终裁决定时任务、回调 webhook（含重试）。

## 当前业务能力
- 链上争议创建与投票逻辑（合约层）。
- `vote()` 中基于 ERC20 余额的投票资格校验。
- 最终裁决逻辑：平票支持 SUPPORT_USER。
- 本地部署流程 + manifest 供服务端消费。
- 服务端 API：创建/查询争议 + HMAC 校验与幂等处理。
- Worker：链上事件索引、自动 finalize、回调 webhook（指数退避重试）。

未实现（规划中）
- 端到端测试覆盖更多异常场景（超时、重复投票、回调失败重试等）。

## 目录结构
```
repo-root/
  apps/
    dao-service/
  contracts/
    hardhat/
  infra/
    docker/
  packages/
    shared/
  pnpm-workspace.yaml
  package.json
  tsconfig.base.json
  README.md
```

## 文件与目录说明

### 根目录
- `pnpm-workspace.yaml`: 工作区声明。
- `package.json`: 根脚本（lint/test/build）。
- `tsconfig.base.json`: 公共 TypeScript 配置。
- `Agent.md`: 执行计划、里程碑与进度记录。
- `README.md`: 项目概要（本文）。

### 合约 (`contracts/hardhat`)
- `contracts/hardhat/hardhat.config.ts`: Hardhat 配置。
- `contracts/hardhat/package.json`: 合约工作区脚本与依赖。
- `contracts/hardhat/contracts/MockERC20.sol`: 测试/部署用的简易 ERC20。
- `contracts/hardhat/contracts/DisputeVoting.sol`: V1 投票合约（资格校验、投票、裁决）。
- `contracts/hardhat/test/DisputeVoting.test.ts`: 投票/裁决规则单测。
- `contracts/hardhat/scripts/deploy.ts`: 部署 MockERC20（可选）+ DisputeVoting 并写入 manifest。
- `contracts/hardhat/deployments/local.json`: 本地部署清单。
- `contracts/hardhat/artifacts`, `contracts/hardhat/cache`: Hardhat 编译输出。

### DAO Service (`apps/dao-service`)
- `apps/dao-service/package.json`: 服务脚本与依赖。
- `apps/dao-service/tsconfig.json`: 服务 TS 配置。
- `apps/dao-service/tsconfig.build.json`: 构建专用 TS 配置。
- `apps/dao-service/prisma/schema.prisma`: Prisma schema 占位（datasource + generator）。
- `apps/dao-service/src/main.ts`: NestJS HTTP 启动入口。
- `apps/dao-service/src/worker.ts`: NestJS Worker 启动入口。
- `apps/dao-service/src/app.module.ts`: 根模块装配。
- `apps/dao-service/src/config/config.schema.ts`: zod 环境变量校验。
- `apps/dao-service/src/config/config.service.ts`: 加载并校验配置。
- `apps/dao-service/src/config/config.module.ts`: 提供 ConfigService。
- `apps/dao-service/src/prisma/prisma.service.ts`: Prisma client 封装。
- `apps/dao-service/src/prisma/prisma.module.ts`: 提供 PrismaService。
- `apps/dao-service/src/auth/auth.module.ts`: auth 模块占位。
- `apps/dao-service/src/callbacks/callbacks.module.ts`: callbacks 模块占位。
- `apps/dao-service/src/chain/chain.module.ts`: chain 模块占位。
- `apps/dao-service/src/disputes/disputes.module.ts`: disputes 模块占位。
- `apps/dao-service/dist`: 构建输出。

## 运行方式（当前）
- 安装依赖：`source ~/.nvm/nvm.sh && nvm use 22 && pnpm install`
- 合约测试：`pnpm --filter contracts-hardhat test`
- 合约本地部署：`pnpm --filter contracts-hardhat run deploy:local`
- 服务构建：`pnpm --filter dao-service build`

## 本地 E2E（M10）
一键执行（推荐）：
- `pnpm e2e:dao`（自动启动 Hardhat 节点、部署、启动 compose、创建争议、投票、强制结束并校验结果；会生成 `.env.e2e`）
- 保留运行环境：`E2E_KEEP=1 pnpm e2e:dao`

手动执行：
1) 启动本地 Hardhat 节点：`pnpm --filter contracts-hardhat run node`
2) 部署合约：`pnpm --filter contracts-hardhat run deploy:localhost`
3) 复制环境变量：`cp .env.example .env`，将 `VOTING_CONTRACT`/`TOKEN_CONTRACT`/`START_BLOCK` 更新为 `contracts/hardhat/deployments/localhost.json` 中的值
4) 启动 compose：`docker compose up`
5) 发送 `POST /v1/disputes`（带 HMAC），然后用本地钱包投票
6) 调用 `POST /v1/disputes/:platformDisputeId/force-finalize`，观察自动 finalize 与 webhook 回调日志

## 当前联调进展
- M8 接口：`POST /v1/disputes` 与 `GET /v1/disputes/:platformDisputeId` 已本地跑通
- M8 幂等：同一 `platformDisputeId` 重复 POST 已验证

## 测试 TODO（待补）
- Worker：链上事件索引可正确写入 Dispute/Vote（含重复事件幂等）。
- Finalizer：到期后自动 finalize，状态变更与 txHash 写入。
- Callback：成功回调后标记 SENT；失败后指数退避并最终停在 FAILED。
- 端到端：从创建争议、投票、快进时间到最终回调的完整链路。

## HMAC 文档
- `docs/HMAC.md`
