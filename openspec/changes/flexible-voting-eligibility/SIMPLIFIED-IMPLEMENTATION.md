# 简化实施方案

## 一、改造点总览

### 1. 数据库层改造

**文件**: `apps/dao-service/prisma/schema.prisma`

**修改内容**:
```prisma
model Dispute {
  // ... 现有字段
  tokenAddress String?  // Agent平台的代币地址（可选）
  minBalance   String?  // 投票门槛（可选，BigInt字符串）
  // ... 其他字段
}
```

### 2. 合约层改造

**文件**: `contracts/hardhat/contracts/DisputeVoting.sol`

**修改内容**:
添加 `voteOnBehalf()` 函数，允许管理员代理投票（跳过余额检查）

```solidity
function voteOnBehalf(uint256 disputeId, address voter, uint8 choice) external {
    require(msg.sender == admin, "ONLY_ADMIN");
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

### 3. 服务端改造

#### 3.1 DTO 扩展

**文件**: `apps/dao-service/src/disputes/disputes.dto.ts`

```typescript
export const createDisputeSchema = z.object({
  // ... 现有字段
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid token address").optional()
  // minBalance 不暴露给API，由系统配置决定
});

export const voteSchema = z.object({
  voter: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
  choice: z.union([z.literal(1), z.literal(2)]),
});
```

#### 3.2 服务层扩展

**文件**: `apps/dao-service/src/disputes/disputes.service.ts`

**新增方法**:
```typescript
async vote(platformDisputeId: string, input: VoteInput) {
  // 1. 查找争议
  const dispute = await this.prisma.dispute.findUnique({
    where: { platformDisputeId }
  });
  
  if (!dispute || dispute.status !== DisputeStatus.VOTING) {
    throw new BadRequestException("Dispute not found or not in voting");
  }
  
  // 2. 检查是否已投票
  const existingVote = await this.prisma.vote.findUnique({
    where: { disputeId_voter: { disputeId: dispute.id, voter: input.voter.toLowerCase() } }
  });
  if (existingVote) {
    throw new BadRequestException("Already voted");
  }
  
  // 3. 确定使用的token地址和门槛
  const tokenAddress = dispute.tokenAddress || this.configService.get().TOKEN_CONTRACT;
  const minBalance = BigInt(dispute.minBalance || this.configService.get().MIN_BALANCE);
  // minBalance 从数据库读取（创建争议时已保存系统配置值）
  
  // 4. 查询链上余额
  const balance = await this.chainService.getTokenBalance(tokenAddress, input.voter);
  
  // 5. 验证余额
  if (balance < minBalance) {
    throw new BadRequestException("Insufficient balance");
  }
  
  // 6. 调用合约 voteOnBehalf
  const tx = await this.chainService.voteOnBehalf(
    dispute.contractDisputeId,
    input.voter,
    input.choice
  );
  const receipt = await tx.wait();
  
  // 7. 记录投票（索引器也会处理，但这里提前记录）
  await this.prisma.vote.create({
    data: {
      disputeId: dispute.id,
      voter: input.voter.toLowerCase(),
      choice: input.choice,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    }
  });
  
  return { txHash: receipt.hash };
}
```

#### 3.3 控制器扩展

**文件**: `apps/dao-service/src/disputes/disputes.controller.ts`

```typescript
@Post(":platformDisputeId/vote")
async vote(
  @Param("platformDisputeId") platformDisputeId: string,
  @Body() body: unknown
) {
  const input = voteSchema.parse(body);
  return this.disputesService.vote(platformDisputeId, input);
}
```

#### 3.4 链服务扩展

**文件**: `apps/dao-service/src/chain/chain.service.ts`

```typescript
async voteOnBehalf(disputeId: bigint, voter: string, choice: number) {
  const contract = await this.getWriteContract();
  return contract.voteOnBehalf(disputeId, voter, choice);
}

async getTokenBalance(tokenAddress: string, address: string): Promise<bigint> {
  const tokenAbi = ["function balanceOf(address) view returns (uint256)"];
  const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, this.provider);
  return await tokenContract.balanceOf(address);
}
```

**更新 VOTING_ABI**:
```typescript
const VOTING_ABI = [
  // ... 现有ABI
  "function voteOnBehalf(uint256 disputeId, address voter, uint8 choice)",
];
```

## 二、Agent 平台代币配置

### PlatformToken (APT) 信息
- **合约地址**: `0xdea48b60cc5bCC6170d6CD81964dE443a8015456`
- **符号**: APT
- **小数位数**: 6 位（不是常见的 18 位）

### 配置示例

在 `.env` 文件中配置：

```env
# 默认 minBalance（用于 18 位小数的代币）
MIN_BALANCE=100000000000000000000

# APT 代币配置（6位小数）
# 0.05 APT = 0.05 * 10^6 = 50000
MIN_BALANCE_MAP='{"0xdea48b60cc5bCC6170d6CD81964dE443a8015456":"50000"}'
```

**重要**：APT 代币有 6 位小数，计算 minBalance 时需要乘以 `10^6`，不是 `10^18`。

## 三、实施步骤

### 步骤1: 数据库迁移

1. 更新 `prisma/schema.prisma` ✅
2. 生成 migration: `pnpm --filter dao-service prisma migrate dev --name add_token_address_min_balance`
3. 运行迁移

### 步骤2: 合约修改

1. 修改 `DisputeVoting.sol`，添加 `voteOnBehalf` 函数 ✅
2. 更新测试
3. 编译和本地测试

### 步骤3: 服务端开发

1. 更新 DTO ✅
2. 实现投票服务方法 ✅
3. 添加投票API端点 ✅
4. 更新链服务 ✅
5. 实现按代币地址配置映射 ✅

### 步骤4: 配置

1. 在 `.env` 中配置 `MIN_BALANCE_MAP`，添加 APT 代币配置
2. 参考 `docs/TOKEN-CONFIG.md` 了解详细配置方式

### 步骤5: 测试

1. 单元测试
2. 集成测试
3. E2E测试（使用 APT 代币）

### 步骤6: 部署

1. 部署新合约
2. 运行数据库迁移
3. 更新配置（添加 `MIN_BALANCE_MAP`）

