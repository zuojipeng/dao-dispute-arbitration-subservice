## Context

当前投票资格验证机制在合约部署时固定 `minBalance` 和 `tokenAddress`，所有争议使用相同的投票门槛和代币。Agent 平台希望：
1. 支持每个争议使用不同的代币（Agent 平台自己的代币）
2. 支持每个争议设置不同的投票门槛
3. 投票时查询链上余额进行验证（保持去中心化）

## Goals / Non-Goals

### Goals
- **简化方案**：创建争议时传入 `tokenAddress`，投票时查询链上余额验证
- **保留链上验证**：通过查询链上余额进行验证，保持去中心化
- 支持每个争议独立的投票门槛和代币配置
- 向后兼容：不传 `tokenAddress` 时使用合约默认 token

### Non-Goals
- 不需要 Agent 平台传入用户余额信息（直接查链上）
- 不需要复杂的验证模式配置（统一用链上查询）
- 不改变现有直接调用合约的投票方式（用户仍可直接与合约交互）

## Decisions

### Decision 1: 方案选择
**已确认**：简化方案 - 创建争议时传入 `tokenAddress`，投票时查询链上余额验证。

### Decision 2: 简化架构

**核心设计**：
1. **创建争议时**：Agent 平台传入 `tokenAddress`（代币地址）和可选的 `minBalance`
2. **服务端投票API**：新增 `POST /v1/disputes/:platformDisputeId/vote` 端点
3. **链上余额查询**：使用 `tokenAddress` 查询用户链上余额
4. **验证和代理投票**：验证余额 >= `minBalance`，通过后调用合约 `voteOnBehalf()` 代理投票

**合约修改**：
- 添加 `voteOnBehalf(uint256 disputeId, address voter, uint8 choice)` 函数
- 仅允许管理员（admin）或授权地址调用
- 跳过余额检查（因为已在服务端验证）
- 保留原有的 `vote()` 函数，供用户直接调用（链上验证）

**实现示例**：
```solidity
function voteOnBehalf(uint256 disputeId, address voter, uint8 choice) external {
    require(msg.sender == admin || authorizedVoters[msg.sender], "UNAUTHORIZED");
    Dispute storage dispute = disputes[disputeId];
    require(dispute.deadline != 0, "NO_DISPUTE");
    require(!hasVoted[disputeId][voter], "ALREADY_VOTED");
    require(choice == 1 || choice == 2, "BAD_CHOICE");
    
    // 跳过余额检查，因为已在服务端验证
    
    hasVoted[disputeId][voter] = true;
    if (choice == 1) {
        dispute.votesAgent += 1;
    } else {
        dispute.votesUser += 1;
    }
    
    emit Voted(disputeId, voter, choice);
}
```

### Decision 3: 数据存储需求

**数据库扩展**：

1. **Dispute 表新增字段**：
   - `validationMode`: `ON_CHAIN` | `OFF_CHAIN`（验证模式）
   - `minBalance`: `String?`（可选，该争议的投票门槛）
   - `tokenAddress`: `String?`（可选，使用的代币地址，默认使用合约配置的token）
   - `voterBalancesJson`: `String?`（可选，Agent平台提供的用户余额映射，JSON格式）

2. **Vote 表新增字段**：
   - `validationMode`: `ON_CHAIN` | `OFF_CHAIN`（该投票使用的验证模式）
   - `validatedBy`: `String?`（验证者地址，链下验证时记录服务端地址）

3. **新增表：VoterBalance**（可选，用于缓存用户余额）：
   - `id`: String (UUID)
   - `disputeId`: String (外键)
   - `voter`: String (地址)
   - `balance`: String (BigInt字符串)
   - `source`: String (`PLATFORM` | `CHAIN` | `CACHED`)
   - `updatedAt`: DateTime

### Decision 4: API 设计

**创建争议API扩展**：
```typescript
POST /v1/disputes
{
  // ... 现有字段
  "validationMode"?: "ON_CHAIN" | "OFF_CHAIN",  // 默认 "ON_CHAIN"
  "minBalance"?: string,  // 可选，该争议的投票门槛（wei单位）
  "tokenAddress"?: string,  // 可选，使用的代币地址
  "voterBalances"?: {  // 可选，Agent平台提供的用户余额映射
    "0x...": "1000000000000000000",
    "0x...": "50000000000000000"
  }
}
```

**新增投票API**：
```typescript
POST /v1/disputes/:platformDisputeId/vote
{
  "voter": "0x...",  // 投票者地址
  "choice": 1 | 2,   // 1=支持Agent, 2=支持User
  "signature"?: string  // 可选，投票者签名（用于验证身份）
}
```

**验证流程**：
1. 检查争议是否存在且处于 VOTING 状态
2. 检查是否已投票
3. 根据 `validationMode` 验证投票资格：
   - `OFF_CHAIN`: 使用 `voterBalances` 或查询 Agent 平台API
   - `ON_CHAIN`: 查询链上余额（向后兼容）
4. 验证通过后，调用合约 `voteOnBehalf()`
5. 记录投票到数据库

## Risks / Trade-offs

### 方案3（链下验证）风险

**安全风险**：
- **中心化风险**：服务端控制投票资格验证，需要信任服务端
- **余额数据可信度**：依赖 Agent 平台提供的余额信息，需要验证机制
- **管理员私钥安全**：需要安全存储和管理用于代理投票的私钥

**缓解措施**：
- 保留链上验证作为默认和备选方案
- 记录所有链下验证的投票，便于审计
- 支持签名验证，确保投票者身份
- 可选的余额验证：服务端可以查询链上余额进行二次验证

**技术风险**：
- **合约升级**：需要添加 `voteOnBehalf` 函数
- **向后兼容**：现有直接调用合约的投票方式继续工作
- **复杂度**：增加服务端验证逻辑和数据库存储

**性能考虑**：
- 链下验证可以减少链上 gas 消耗
- 但需要额外的服务端处理和数据库查询

### 安全考虑

**链下验证安全措施**：
1. **签名验证**：投票API可要求用户签名，验证投票者身份
2. **余额验证**：服务端可以查询链上余额进行二次验证（即使使用链下模式）
3. **审计日志**：记录所有链下验证的投票，包括验证者、时间戳、余额来源
4. **权限控制**：`voteOnBehalf` 仅允许管理员或授权地址调用
5. **防重放**：使用 nonce 或时间戳防止重放攻击

## Migration Plan

### 方案3（链下验证）实施步骤

**阶段1：数据库迁移**
1. 创建 Prisma migration，添加新字段
2. 更新 Prisma schema
3. 运行迁移

**阶段2：合约修改**
1. 修改 `DisputeVoting.sol`，添加 `voteOnBehalf` 函数
2. 添加授权机制（可选，支持多个授权地址）
3. 更新合约测试
4. 编译和本地测试

**阶段3：服务端开发**
1. 扩展 `Dispute` 模型和 DTO
2. 实现投票资格验证服务
3. 实现新的投票 API 端点
4. 更新 `ChainService`，添加 `voteOnBehalf` 调用
5. 实现余额查询逻辑（支持 Agent 平台提供或链上查询）

**阶段4：测试**
1. 单元测试：验证服务端验证逻辑
2. 集成测试：测试完整投票流程
3. E2E 测试：测试链下验证和链上验证两种模式

**阶段5：部署**
1. 部署新合约到 Sepolia
2. 更新服务端配置
3. 运行数据库迁移
4. 验证功能
5. 通知 Agent 平台新 API

### 向后兼容策略

- **现有争议**：继续使用链上验证（`validationMode = ON_CHAIN`）
- **新争议**：默认使用链上验证，Agent 平台可选择链下验证
- **直接合约调用**：用户仍可直接调用合约 `vote()` 函数（链上验证）

## Open Questions

1. **余额数据来源**：Agent 平台如何提供用户余额？是否需要 API 端点查询？
2. **签名验证**：投票API是否需要强制要求用户签名？还是可选？
3. **授权地址**：除了管理员，是否需要支持多个授权地址调用 `voteOnBehalf`？
4. **余额缓存**：是否需要缓存用户余额？缓存过期时间？
5. **审计要求**：链下验证的投票是否需要额外的审计日志或事件？

