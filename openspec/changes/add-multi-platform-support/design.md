# 设计文档：多平台多代币支持

## Context

当前DAO争议仲裁服务支持单一代币治理，所有投票使用相同的ERC20代币和最小余额阈值。随着多个Agent平台接入需求，需要支持每个平台使用自己的治理代币进行投票。

**利益相关者**：
- Agent平台运营方（需要使用自己的代币）
- DAO服务运维方（需要管理多平台配置）
- 最终用户（使用平台代币投票）

**约束**：
- 不修改已部署的智能合约
- 保持向后兼容性
- 最小化数据库迁移影响

## Goals / Non-Goals

### Goals
1. 支持多平台接入，每个平台独立配置治理代币
2. 创建争议时指定平台，自动继承平台配置
3. 投票时动态查找平台代币合约验证余额
4. 提供平台配置管理API

### Non-Goals  
- 不实现平台级别的访问控制（所有平台共享HMAC密钥）
- 不修改链上合约逻辑
- 不支持跨链多平台
- 不实现平台级别的数据隔离（仅配置隔离）

## Decisions

### Decision 1: Platform实体设计

**选择**：在数据库中新增Platform表存储平台配置

**理由**：
- 灵活性高，支持运行时动态配置
- 便于平台自助管理（未来可扩展）
- 避免环境变量爆炸

**数据模型**：
```prisma
model Platform {
  id              String    @id        // 平台唯一标识，如 "agent-platform-001"
  name            String                 // 平台名称，如 "Agent平台"
  tokenContract   String                 // ERC20代币合约地址
  minBalance      String                 // 最小余额（Wei单位字符串）
  chainId         Int                    // 链ID（当前仅支持Sepolia）
  description     String?                // 平台描述
  webhookUrl      String?                // 回调URL（可选，默认使用全局配置）
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  disputes        Dispute[]              // 关联的争议
}
```

**Alternatives considered**：
- 方案B：使用JSON配置文件 → 不够灵活，需要重启服务
- 方案C：扩展MIN_BALANCE_MAP → 无法支持不同代币，扩展性差

### Decision 2: 争议与平台关联

**选择**：Dispute表添加platformId外键，创建时必填

**理由**：
- 明确争议所属平台
- 便于查询和统计
- 支持平台级别的数据分析

**API变更**：
```typescript
// 之前
POST /v1/disputes
{
  "platformDisputeId": "...",
  "jobId": "...",
  // ...
}

// 之后（BREAKING）
POST /v1/disputes  
{
  "platformId": "agent-platform-001",  // 新增必填
  "platformDisputeId": "...",
  "jobId": "...",
  // ...
}
```

**Alternatives considered**：
- 方案B：platformId可选，不传使用默认平台 → 不够明确，容易混淆
- 方案C：从platformDisputeId解析平台 → 耦合度高，不灵活

### Decision 3: 投票资格验证逻辑

**选择**：服务端投票前动态查找平台配置并验证余额

**流程**：
```
1. 接收投票请求 (disputeId, voter, choice)
2. 查找争议 → 获取platformId
3. 查找平台配置 → 获取tokenContract和minBalance
4. 调用链上查询余额 balanceOf(voter, tokenContract)
5. 验证 balance >= minBalance
6. 验证通过 → 调用合约voteOnBehalf
7. 记录投票到数据库
```

**代码示例**：
```typescript
async vote(disputeId: bigint, voter: string, choice: number) {
  // 1. 查找争议
  const dispute = await this.prisma.dispute.findUnique({
    where: { contractDisputeId: disputeId },
    include: { platform: true }  // 关联查询平台
  });
  
  // 2. 获取平台配置（如果没有平台，使用默认配置）
  const tokenContract = dispute.platform?.tokenContract 
    || this.config.DEFAULT_TOKEN_CONTRACT;
  const minBalance = dispute.platform?.minBalance
    || this.config.DEFAULT_MIN_BALANCE;
  
  // 3. 验证余额
  const balance = await this.chain.getBalance(voter, tokenContract);
  if (BigInt(balance) < BigInt(minBalance)) {
    throw new BadRequestException("Insufficient balance");
  }
  
  // 4. 代理投票
  await this.chain.voteOnBehalf(disputeId, voter, choice);
}
```

**Alternatives considered**：
- 方案B：在合约中支持多代币 → 需要升级合约，成本高
- 方案C：每个平台部署独立合约 → 管理复杂度高

## Risks / Trade-offs

### Risk 1: 平台配置错误导致投票失败

**风险**：管理员配置错误的tokenContract或minBalance

**缓解措施**：
- 创建平台时验证tokenContract格式（0x地址）
- 提供配置验证接口
- 添加平台配置变更审计日志

### Risk 2: 数据库迁移影响现有争议

**风险**：现有Dispute记录没有platformId

**缓解措施**：
- 创建默认平台（id: "default"），使用当前TOKEN_CONTRACT配置
- 迁移脚本将现有争议关联到默认平台
- platformId字段设置为可空，向后兼容

### Risk 3: 性能影响

**风险**：每次投票需要额外查询Platform表

**缓解措施**：  
- 使用include关联查询，避免N+1问题
- 考虑添加Platform缓存层
- Dispute和Platform使用数据库索引优化

## Migration Plan

### 阶段1：数据库迁移（无停机）

1. 创建Platform表
2. 创建默认平台：
   ```sql
   INSERT INTO "Platform" (id, name, tokenContract, minBalance, chainId)
   VALUES (
     'default',
     'Default Platform',
     '0x5D2F8D5aCEf44b8e7aC0c67696962ee93807db95',
     '100000000000000000000',
     11155111
   );
   ```
3. 添加Dispute.platformId字段（nullable）
4. 迁移现有争议：
   ```sql
   UPDATE "Dispute" SET platformId = 'default' WHERE platformId IS NULL;
   ```
5. 添加外键约束

### 阶段2：代码部署

1. 部署新代码（支持platformId，但不强制）
2. 测试默认平台功能
3. 创建Agent平台配置
4. 测试Agent平台争议创建和投票

### 阶段3：API变更（BREAKING）

1. 修改API文档，标记platformId为必填
2. 通知接入方更新API调用
3. 设置过渡期（2周）  
4. 过渡期后，platformId改为必填，拒绝不包含platformId的请求

### 回滚计划

如果出现问题：
1. 回滚代码到上一版本
2. Dispute.platformId字段保留但不使用
3. Platform表数据保留供后续排查

## Open Questions

1. **平台管理权限**：谁可以创建/修改平台配置？
   - 暂定：仅管理员通过直接数据库操作
   - 未来：提供管理后台或Admin API

2. **平台级别的回调URL**：每个平台是否需要独立的webhook地址？
   - 当前：Platform表包含webhookUrl字段（可选）
   - 实现：如果平台配置了webhookUrl，优先使用；否则使用全局PLATFORM_WEBHOOK_URL

3. **多链支持**：未来是否支持不同平台部署在不同链？
   - 当前：仅支持Sepolia（chainId字段预留）
   - 未来：可扩展支持多链，每个Platform配置独立的chainId和RPC_URL


