## 1. 方案确认（已完成）

- [x] 1.1 确认简化方案：创建争议时传入tokenAddress，投票时查询链上余额验证
- [x] 1.2 确认验证机制：统一使用链上余额查询验证
- [x] 1.3 确认数据存储需求：只需要tokenAddress和minBalance
- [x] 1.4 更新提案和设计文档

## 2. 方案1实施：降低投票门槛

- [ ] 2.1 更新 `.env.example`，将 `MIN_BALANCE` 默认值改为 0.05 token（50000000000000000，即 0.05 * 10^18）
- [ ] 2.2 更新部署脚本注释，说明 `MIN_BALANCE` 单位
- [ ] 2.3 更新 `deployments/sepolia.json`（如需要重新部署）
- [ ] 2.4 更新文档，说明投票门槛配置

## 3. 简化方案实施：基于tokenAddress的链上验证

### 3.1 数据库迁移

- [ ] 3.1.1 更新 `prisma/schema.prisma`，在 `Dispute` 模型添加 `tokenAddress` 和 `minBalance` 字段
- [ ] 3.1.2 生成 Prisma migration: `pnpm --filter dao-service prisma migrate dev --name add_token_address_min_balance`
- [ ] 3.1.3 运行 migration（本地测试）

### 3.2 合约修改

- [ ] 3.2.1 修改 `DisputeVoting.sol`，添加 `voteOnBehalf(uint256 disputeId, address voter, uint8 choice)` 函数
- [ ] 3.2.2 确保仅 admin 可调用（`require(msg.sender == admin, "ONLY_ADMIN")`）
- [ ] 3.2.3 更新合约测试，覆盖 `voteOnBehalf` 函数
- [ ] 3.2.4 测试权限控制（非admin调用应失败）
- [ ] 3.2.5 编译和本地测试合约

### 3.3 服务端开发

- [ ] 3.3.1 更新 `disputes.dto.ts`：
  - 扩展 `createDisputeSchema`，添加 `tokenAddress` 和 `minBalance`（可选）
  - 添加 `voteSchema`（`voter` 和 `choice`）
- [ ] 3.3.2 更新 `disputes.service.ts`：
  - 修改 `createDispute()`，保存 `tokenAddress` 和 `minBalance` 到数据库
  - 实现 `vote()` 方法：查询链上余额 → 验证 → 调用合约
- [ ] 3.3.3 在 `disputes.controller.ts` 中添加 `POST /v1/disputes/:platformDisputeId/vote` 端点
- [ ] 3.3.4 在 `chain.service.ts` 中：
  - 添加 `voteOnBehalf()` 方法
  - 添加 `getTokenBalance()` 方法（查询任意ERC20代币余额）
  - 更新 `VOTING_ABI`，包含 `voteOnBehalf` 函数签名

### 3.4 测试和验证

- [ ] 3.4.1 单元测试：测试 `getTokenBalance()` 方法
- [ ] 3.4.2 单元测试：测试投票资格验证逻辑（余额足够/不足）
- [ ] 3.4.3 集成测试：测试完整投票流程（创建争议 → 投票API → 合约调用）
- [ ] 3.4.4 E2E 测试：测试使用不同tokenAddress的争议
- [ ] 3.4.5 验证向后兼容性：
  - 不传 `tokenAddress` 时使用合约默认token
  - 用户仍可直接调用合约 `vote()` 函数
- [ ] 3.4.6 手动测试创建争议和投票流程

### 3.5 部署

- [ ] 3.5.1 部署新合约到 Sepolia
- [ ] 3.5.2 更新 `deployments/sepolia.json`
- [ ] 3.5.3 运行数据库迁移（生产环境）
- [ ] 3.5.4 更新服务端配置，指向新合约地址
- [ ] 3.5.5 验证生产环境功能
- [ ] 3.5.6 更新 API 文档

## 4. 部署

- [ ] 4.1 如果选择方案2，部署新合约到 Sepolia
- [ ] 4.2 更新 `deployments/sepolia.json`
- [ ] 4.3 更新服务端配置，指向新合约地址
- [ ] 4.4 验证生产环境功能

