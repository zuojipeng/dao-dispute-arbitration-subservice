# Change: 多平台多代币支持

## Why

当前系统设计为单一代币治理模式，存在以下限制：

1. **缺乏多租户支持**：所有争议共享同一个代币合约和最小余额配置
2. **平台绑定问题**：Agent平台有自己的代币体系，无法灵活配置投票权重  
3. **可扩展性受限**：每个接入平台都需要使用DAO部署的MockERC20，而非平台自己的治理代币
4. **盈利模式单一**：无法为不同平台提供差异化的治理服务

**业务场景**：
- A平台（Agent）接入 → 用户用APT代币投票，最小余额0.1 APT
- B平台（Freelancer）接入 → 用户用FLT代币投票，最小余额100 FLT  
- 每个平台独立配置，互不干扰

## What Changes

### 核心功能

#### 1. Platform配置管理（新增）
- 新增Platform实体，存储平台基本信息和治理配置
- 新增Platform管理API（CRUD）
- 支持平台级别的代币合约和最小余额配置

#### 2. 争议平台关联（修改）
- **BREAKING**：`POST /v1/disputes` API增加 `platformId` 必填参数
- Dispute实体关联Platform（外键）
- 创建争议时自动继承平台的代币配置

#### 3. 动态投票资格验证（修改）
- 投票时根据争议所属平台动态查找代币合约
- 使用平台配置的最小余额进行验证
- 向后兼容：如果未指定平台，使用默认配置

#### 4. 平台数据隔离（增强）
- 查询争议时可按平台过滤
- 每个平台独立的投票统计

### 配置变更

**当前**：
```env
TOKEN_CONTRACT=0x5D2F8D5aCEf44b8e7aC0c67696962ee93807db95
MIN_BALANCE=100000000000000000000
MIN_BALANCE_MAP={"0xdea48b60cc5bCC6170d6CD81964dE443a8015456":"5000000"}
```

**变更后**（作为默认值）：
```env
DEFAULT_TOKEN_CONTRACT=0x5D2F8D5aCEf44b8e7aC0c67696962ee93807db95  
DEFAULT_MIN_BALANCE=100000000000000000000
```

平台特定配置存储在数据库Platform表中。

## Impact

- **影响的规范**：
  - 平台配置管理（新增）
  - 争议创建API（修改）
  - 投票资格验证（修改）

- **影响的代码**：
  - `apps/dao-service/prisma/schema.prisma`（新增Platform表，修改Dispute表）
  - `apps/dao-service/src/platforms/`（新增模块）
  - `apps/dao-service/src/disputes/disputes.dto.ts`（修改CreateDisputeInput）
  - `apps/dao-service/src/disputes/disputes.service.ts`（修改投票逻辑）
  - `apps/dao-service/src/disputes/disputes.controller.ts`（修改API）
  - `apps/dao-service/src/config/config.service.ts`（添加默认值支持）

- **数据库迁移**：需要创建Platform表并迁移现有争议数据

## Non-Goals（不包含）

- 不修改链上合约（继续使用voteOnBehalf机制）
- 不实现平台级别的权限隔离（所有平台共享HMAC密钥）
- 不实现多链支持（仅Sepolia测试网）


