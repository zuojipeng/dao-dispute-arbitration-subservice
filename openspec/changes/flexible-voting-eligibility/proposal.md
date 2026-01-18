# Change: 灵活的投票资格验证机制

## Why

当前投票资格验证机制存在以下限制：
1. **固定门槛**：`minBalance` 在合约部署时固定，无法根据实际需求调整
2. **单一代币**：所有争议使用同一个 ERC20 token 和相同的余额阈值
3. **缺乏灵活性**：Agent 平台可能有自己的代币体系，无法灵活配置投票资格

**简化方案**（已确认）：
- 创建争议时传入 `tokenAddress`（Agent 平台的代币地址）
- 投票时查询链上余额验证，验证通过后代理投票
- 支持每个争议使用不同的代币和投票门槛

## What Changes

### 简化方案：基于代币地址的链上验证
- **BREAKING**：修改 `POST /v1/disputes` API，支持 `tokenAddress` 和 `minBalance` 参数
- **BREAKING**：修改合约 `DisputeVoting.sol`，添加 `voteOnBehalf()` 函数（管理员代理投票）
- **新增**：创建 `POST /v1/disputes/:platformDisputeId/vote` API 端点（服务端投票）
- **新增**：数据库扩展，存储 `tokenAddress` 和 `minBalance`

**核心功能**：
1. **创建争议时配置**：
   - `tokenAddress`: Agent 平台的代币地址（可选，不传则使用合约默认token）
   - `minBalance`: 由系统配置决定，不暴露给API（使用环境变量 `MIN_BALANCE`）

2. **服务端投票API**：
   - 使用 `tokenAddress` 查询链上余额
   - 验证余额 >= `minBalance`
   - 验证通过后调用合约 `voteOnBehalf()` 进行代理投票
   - 记录投票信息到数据库

3. **保留链上验证**：
   - 用户仍可直接调用合约 `vote()` 函数（使用合约部署时的默认token）
   - 向后兼容现有功能

## Impact

- **影响的规范**：
  - 投票资格验证机制
  - 争议创建 API
  - 合约投票逻辑

- **影响的代码**：
  - `contracts/hardhat/contracts/DisputeVoting.sol`（添加 `voteOnBehalf` 函数）
  - `contracts/hardhat/scripts/deploy.ts`（方案1，可选）
  - `apps/dao-service/prisma/schema.prisma`（数据库扩展）
  - `apps/dao-service/src/disputes/disputes.dto.ts`（扩展创建争议和投票DTO）
  - `apps/dao-service/src/disputes/disputes.service.ts`（添加投票服务和验证逻辑）
  - `apps/dao-service/src/disputes/disputes.controller.ts`（添加投票API端点）
  - `apps/dao-service/src/chain/chain.service.ts`（添加 `voteOnBehalf` 调用）

## 需要存储的数据

### 数据库扩展

1. **Dispute 表新增字段**：
   - `tokenAddress`: `String?`（Agent平台的代币地址，可选，不传则使用合约默认token）
   - `minBalance`: `String?`（系统配置的投票门槛，从环境变量 `MIN_BALANCE` 读取，不暴露给API）

**说明**：
- 如果 `tokenAddress` 为空，使用合约部署时配置的默认 token（向后兼容）
- `minBalance` 始终使用环境变量 `MIN_BALANCE` 的值，不由 API 传入

