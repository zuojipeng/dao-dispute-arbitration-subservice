# 实施任务清单

## 1. 数据库Schema变更
- [x] 1.1 创建Platform模型（Prisma schema）
- [x] 1.2 修改Dispute模型，添加platformId外键（nullable）
- [x] 1.3 生成数据库迁移文件
- [x] 1.4 创建默认平台的seed脚本

## 2. Platform模块实现
- [x] 2.1 创建 `platforms/` 模块目录结构
- [x] 2.2 实现Platform DTO（create, update）
- [x] 2.3 实现PlatformsService（CRUD逻辑）
- [x] 2.4 实现PlatformsController（API端点）
- [x] 2.5 在AppModule中注册PlatformsModule

## 3. Config服务增强
- [x] 3.1 添加DEFAULT_TOKEN_CONTRACT环境变量支持
- [x] 3.2 添加DEFAULT_MIN_BALANCE环境变量支持
- [x] 3.3 添加getDefaultPlatformConfig()方法

## 4. Disputes模块修改
- [x] 4.1 修改CreateDisputeInput，添加platformId必填字段
- [x] 4.2 修改DisputesService.createDispute()，验证platformId并关联平台
- [x] 4.3 修改DisputesService.vote()，动态查找平台配置验证余额
- [x] 4.4 修改争议查询，支持platformId过滤参数
- [x] 4.5 修改争议返回值，包含平台信息

## 5. 数据库迁移
- [x] 5.1 创建迁移文件和验证脚本
- [x] 5.2 在本地环境应用迁移并测试（✅ 迁移成功应用）
- [x] 5.3 运行seed脚本创建默认平台（✅ 默认平台已创建）
- [x] 5.4 迁移现有争议到默认平台（✅ 12个争议已迁移到默认平台）
- [x] 5.5 验证数据完整性（✅ Platform表存在、默认平台存在、所有争议已关联、外键关系正常）

## 6. 测试
- [x] 6.1 Platform CRUD测试（✅ 测试通过：创建、查询、更新平台功能正常）
- [x] 6.2 争议创建（带platformId）测试（✅ 测试通过：创建争议、平台信息关联、平台过滤功能正常）
- [x] 6.3 投票资格验证（平台代币）测试（✅ 测试通过：平台配置使用正确，多平台配置隔离正常）
- [ ] 6.4 E2E测试：创建平台 → 创建争议 → 投票（需要链上交互，可后续测试）
- [x] 6.5 向后兼容测试（✅ 默认平台正常工作，现有争议已迁移）

## 7. 文档更新
- [x] 7.1 更新API文档（新增Platform API）
- [x] 7.2 更新Dispute API文档（platformId参数）
- [x] 7.3 更新部署文档（环境变量变更）
- [x] 7.4 创建平台配置指南（已在迁移指南中包含）
- [x] 7.5 创建迁移指南（给现有接入方）

## 8. 生产环境迁移
- [ ] 8.1 准备生产环境迁移脚本
- [ ] 8.2 在Staging环境测试完整迁移流程
- [ ] 8.3 通知接入方API变更（过渡期2周）
- [ ] 8.4 部署到生产环境
- [ ] 8.5 执行数据库迁移
- [ ] 8.6 监控错误日志和性能
- [ ] 8.7 过渡期结束后，强制platformId必填

## 依赖关系

- 步骤1 → 步骤5（数据库迁移依赖schema定义）
- 步骤2、3、4 可并行开发
- 步骤6 依赖步骤1-5完成
- 步骤7 可在开发期间并行进行
- 步骤8 依赖所有前置步骤完成且测试通过

