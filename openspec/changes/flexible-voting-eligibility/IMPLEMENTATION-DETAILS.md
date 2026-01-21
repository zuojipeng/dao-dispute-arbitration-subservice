# 链下验证实施方案详细说明

## 一、改造点总览

### 1. 合约层改造

**文件**: `contracts/hardhat/contracts/DisputeVoting.sol`

**修改内容**:
1. 添加 `voteOnBehalf(uint256 disputeId, address voter, uint8 choice)` 函数
2. 可选：添加授权机制，支持多个授权地址（不仅限于admin）

**关键代码**:
```solidity
mapping(address => bool) public authorizedVoters;  // 可选：授权地址映射

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

// 可选：添加授权管理函数
function setAuthorizedVoter(address voter, bool authorized) external {
    require(msg.sender == admin, "ONLY_ADMIN");
    authorizedVoters[voter] = authorized;
}
```

### 2. 数据库层改造

**文件**: `apps/dao-service/prisma/schema.prisma`

**修改内容**:
1. 扩展 `Dispute` 模型
2. 扩展 `Vote` 模型
3. 可选：新增 `VoterBalance` 模型

**Prisma Schema 变更**:
```prisma
enum ValidationMode {
  ON_CHAIN
  OFF_CHAIN
}

model Dispute {
  // ... 现有字段
  validationMode    ValidationMode  @default(ON_CHAIN)
  minBalance        String?
  tokenAddress      String?
  voterBalancesJson String?         // JSON格式: {"0x...": "1000000000000000000", ...}
  // ... 其他字段
}

model Vote {
  // ... 现有字段
  validationMode ValidationMode @default(ON_CHAIN)
  validatedBy     String?
  // ... 其他字段
}

// 可选：用户余额缓存表
model VoterBalance {
  id        String   @id @default(uuid())
  disputeId String
  voter     String
  balance   String   // BigInt字符串
  source    String   // PLATFORM | CHAIN | CACHED
  updatedAt DateTime @default(now())
  dispute   Dispute  @relation(fields: [disputeId], references: [id])
  
  @@unique([disputeId, voter])
  @@index([disputeId])
}
```

### 3. 服务端改造

#### 3.1 DTO 扩展

**文件**: `apps/dao-service/src/disputes/disputes.dto.ts`

**修改内容**:
```typescript
export const createDisputeSchema = z.object({
  // ... 现有字段
  validationMode: z.enum(["ON_CHAIN", "OFF_CHAIN"]).optional().default("ON_CHAIN"),
  minBalance: z.string().optional(),  // BigInt字符串
  tokenAddress: z.string().optional(),
  voterBalances: z.record(z.string(), z.string()).optional(),  // { address: balance }
});

export const voteSchema = z.object({
  voter: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
  choice: z.union([z.literal(1), z.literal(2)]),
  signature: z.string().optional(),  // 可选，用于验证身份
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
  
  // 2. 验证争议状态
  if (!dispute || dispute.status !== DisputeStatus.VOTING) {
    throw new BadRequestException("Dispute not found or not in voting");
  }
  
  // 3. 检查是否已投票
  const existingVote = await this.prisma.vote.findUnique({
    where: { disputeId_voter: { disputeId: dispute.id, voter: input.voter.toLowerCase() } }
  });
  if (existingVote) {
    throw new BadRequestException("Already voted");
  }
  
  // 4. 验证投票资格（根据 validationMode）
  await this.validateVotingEligibility(dispute, input.voter);
  
  // 5. 调用合约 voteOnBehalf
  const tx = await this.chainService.voteOnBehalf(
    dispute.contractDisputeId,
    input.voter,
    input.choice
  );
  const receipt = await tx.wait();
  
  // 6. 记录投票到数据库（索引器也会处理，但这里提前记录）
  await this.prisma.vote.create({
    data: {
      disputeId: dispute.id,
      voter: input.voter.toLowerCase(),
      choice: input.choice,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      validationMode: dispute.validationMode,
      validatedBy: dispute.validationMode === ValidationMode.OFF_CHAIN 
        ? this.configService.get().SERVICE_ADDRESS 
        : null,
    }
  });
  
  return { txHash: receipt.hash };
}

private async validateVotingEligibility(dispute: Dispute, voter: string) {
  if (dispute.validationMode === ValidationMode.ON_CHAIN) {
    // 链上验证：查询链上余额
    const balance = await this.chainService.getTokenBalance(
      dispute.tokenAddress || this.configService.get().TOKEN_CONTRACT,
      voter
    );
    const minBalance = BigInt(dispute.minBalance || this.configService.get().MIN_BALANCE);
    if (balance < minBalance) {
      throw new BadRequestException("Insufficient balance");
    }
  } else {
    // 链下验证：使用 Agent 平台提供的余额或查询
    const voterBalances = dispute.voterBalancesJson 
      ? JSON.parse(dispute.voterBalancesJson) 
      : {};
    const voterBalance = voterBalances[voter.toLowerCase()];
    
    if (!voterBalance) {
      // 可选：查询 Agent 平台 API 获取余额
      // 或查询链上余额作为后备
      const balance = await this.chainService.getTokenBalance(
        dispute.tokenAddress || this.configService.get().TOKEN_CONTRACT,
        voter
      );
      const minBalance = BigInt(dispute.minBalance || this.configService.get().MIN_BALANCE);
      if (balance < minBalance) {
        throw new BadRequestException("Insufficient balance");
      }
    } else {
      const balance = BigInt(voterBalance);
      const minBalance = BigInt(dispute.minBalance || this.configService.get().MIN_BALANCE);
      if (balance < minBalance) {
        throw new BadRequestException("Insufficient balance");
      }
    }
  }
}
```

#### 3.3 控制器扩展

**文件**: `apps/dao-service/src/disputes/disputes.controller.ts`

**新增端点**:
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

**新增方法**:
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

## 二、需要存储的数据

### 1. Dispute 表新增字段

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `validationMode` | `ValidationMode` | 验证模式 | `ON_CHAIN` 或 `OFF_CHAIN` |
| `minBalance` | `String?` | 投票门槛（BigInt字符串） | `"50000000000000000"` (0.05 token) |
| `tokenAddress` | `String?` | 代币地址 | `"0x..."` |
| `voterBalancesJson` | `String?` | 用户余额映射（JSON） | `{"0x...": "1000000000000000000"}` |

### 2. Vote 表新增字段

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `validationMode` | `ValidationMode` | 验证模式 | `ON_CHAIN` 或 `OFF_CHAIN` |
| `validatedBy` | `String?` | 验证者地址 | 链下验证时记录服务端地址 |

### 3. VoterBalance 表（可选）

用于缓存用户余额，减少重复查询：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `String` | UUID |
| `disputeId` | `String` | 争议ID（外键） |
| `voter` | `String` | 投票者地址 |
| `balance` | `String` | 余额（BigInt字符串） |
| `source` | `String` | 来源：`PLATFORM`、`CHAIN`、`CACHED` |
| `updatedAt` | `DateTime` | 更新时间 |

## 三、实施步骤

1. **数据库迁移**
   - 创建 Prisma migration
   - 运行迁移

2. **合约开发**
   - 修改 `DisputeVoting.sol`
   - 添加测试
   - 编译和本地测试

3. **服务端开发**
   - 更新 DTO
   - 实现验证逻辑
   - 实现投票API
   - 更新链服务

4. **测试**
   - 单元测试
   - 集成测试
   - E2E 测试

5. **部署**
   - 部署合约
   - 运行数据库迁移
   - 更新服务端配置

## 四、安全考虑

1. **管理员私钥安全**：用于 `voteOnBehalf` 的私钥必须安全存储
2. **签名验证**：可选但推荐，验证投票者身份
3. **余额验证**：即使链下验证，也可查询链上余额进行二次验证
4. **审计日志**：记录所有链下验证的投票
5. **权限控制**：`voteOnBehalf` 仅允许授权地址调用


