# 多平台多代币支持 - OpenSpec提案

## 提案概览

**Change ID**: `add-multi-platform-support`  
**状态**: 📝 待审批  
**创建时间**: 2026-01-20

## 快速导航

- [📄 Proposal](./proposal.md) - 提案说明（为什么、是什么、影响）
- [🏗️ Design](./design.md) - 技术设计文档（架构决策、迁移计划）
- [✅ Tasks](./tasks.md) - 实施任务清单（分8个阶段）
- [📋 Specs](./specs/) - 规范增量
  - [platform-config/spec.md](./specs/platform-config/spec.md) - 平台配置管理规范
  - [disputes/spec.md](./specs/disputes/spec.md) - 争议API修改规范

## 核心变更

### 1. 新增Platform配置管理
- Platform实体（数据库表）
- Platform CRUD API
- 平台级别的代币和最小余额配置

### 2. 争议与平台关联
- **BREAKING**: 创建争议时platformId必填
- 自动继承平台的代币配置

### 3. 动态投票验证
- 根据争议所属平台查找代币合约
- 动态验证余额

## API变更示例

### 创建平台
```http
POST /v1/platforms
{
  "id": "agent-platform-001",
  "name": "Agent平台",
  "tokenContract": "0x...",
  "minBalance": "100000000",
  "chainId": 11155111
}
```

### 创建争议（新增platformId）
```http
POST /v1/disputes
{
  "platformId": "agent-platform-001",  // ← 新增必填
  "platformDisputeId": "...",
  "jobId": "...",
  "billId": "...",
  // ...
}
```

## 数据库变更

### 新增表
```sql
CREATE TABLE "Platform" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tokenContract TEXT NOT NULL,
  minBalance TEXT NOT NULL,
  chainId INT NOT NULL,
  description TEXT,
  webhookUrl TEXT,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);
```

### 修改表
```sql
ALTER TABLE "Dispute" 
ADD COLUMN platformId TEXT REFERENCES "Platform"(id);
```

## 迁移策略

1. **阶段1**: 数据库迁移（添加Platform表，Dispute.platformId可空）
2. **阶段2**: 创建默认平台，迁移现有数据
3. **阶段3**: 部署新代码（支持但不强制platformId）
4. **阶段4**: 过渡期（2周），通知接入方
5. **阶段5**: platformId改为必填

## 影响范围

### 文件变更（预计）
- 新增: `apps/dao-service/src/platforms/` (模块)
- 修改: `apps/dao-service/prisma/schema.prisma`
- 修改: `apps/dao-service/src/disputes/*.ts` (5-6个文件)
- 修改: `apps/dao-service/src/config/config.service.ts`
- 新增: 数据库迁移文件

### 接口变更
- 新增: 4个Platform API端点
- 修改: 争议创建API（BREAKING）
- 增强: 争议查询API（支持平台过滤）

## 验证清单

在实施前确认：
- [ ] 规范格式符合OpenSpec要求（场景使用#### Scenario:）
- [ ] 每个需求至少有一个场景
- [ ] MODIFIED需求包含完整的修改后内容
- [ ] 任务清单完整且可执行
- [ ] 设计文档包含迁移计划和风险缓解

## 下一步

1. **审批**: 团队review提案内容
2. **细化**: 根据反馈调整设计
3. **排期**: 安排开发时间（预计2-3周）
4. **实施**: 按tasks.md清单逐项完成
5. **验证**: 运行测试并验证功能
6. **部署**: 按迁移计划部署到生产
7. **归档**: 部署完成后归档提案

## 联系

如有疑问或建议，请查看相关文档或联系提案作者。


