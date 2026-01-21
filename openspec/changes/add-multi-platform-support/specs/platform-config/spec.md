# Platform Configuration Spec Delta

## ADDED Requirements

### Requirement: Platform Registration
系统 SHALL 支持多个Agent平台注册和配置管理。

#### Scenario: 创建新平台成功
- **WHEN** 管理员创建新平台，提供平台ID、名称、代币合约地址和最小余额
- **THEN** 系统创建Platform记录并返回平台配置
- **AND** 平台配置可用于后续争议创建

#### Scenario: 平台ID冲突
- **WHEN** 尝试创建已存在ID的平台
- **THEN** 系统返回409 Conflict错误

#### Scenario: 代币合约地址验证
- **WHEN** 创建平台时提供无效的代币合约地址（非0x格式或长度错误）
- **THEN** 系统返回400 Bad Request错误，说明地址格式无效

### Requirement: Platform Configuration Retrieval
系统 SHALL 提供查询平台配置的API。

#### Scenario: 查询单个平台
- **WHEN** 请求查询指定platformId的配置
- **THEN** 系统返回平台的完整配置信息（ID、名称、代币地址、最小余额等）

#### Scenario: 列出所有平台
- **WHEN** 请求查询所有平台
- **THEN** 系统返回平台列表，按创建时间倒序排列

#### Scenario: 查询不存在的平台
- **WHEN** 请求查询不存在的platformId
- **THEN** 系统返回404 Not Found错误

### Requirement: Platform Configuration Update
系统 SHALL 支持更新平台配置。

#### Scenario: 更新代币配置
- **WHEN** 管理员更新平台的tokenContract或minBalance
- **THEN** 系统更新Platform记录并返回新配置
- **AND** 新创建的争议使用新配置
- **AND** 已存在的争议继续使用创建时的配置

#### Scenario: 更新平台基本信息
- **WHEN** 管理员更新平台的名称或描述
- **THEN** 系统更新Platform记录

### Requirement: Default Platform Fallback
系统 SHALL 提供默认平台配置，用于向后兼容和回退。

#### Scenario: 使用默认平台
- **WHEN** 争议未关联任何平台（platformId为null）
- **THEN** 系统使用默认平台的代币配置（DEFAULT_TOKEN_CONTRACT和DEFAULT_MIN_BALANCE）

#### Scenario: 默认平台配置来源
- **WHEN** 系统启动时
- **THEN** 从环境变量加载DEFAULT_TOKEN_CONTRACT和DEFAULT_MIN_BALANCE作为默认值


