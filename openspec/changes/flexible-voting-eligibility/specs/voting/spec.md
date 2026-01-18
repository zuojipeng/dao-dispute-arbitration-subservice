## MODIFIED Requirements

### Requirement: 投票资格验证
投票资格验证机制 SHALL 支持链上和链下两种验证模式。

#### Scenario: 链上验证（默认模式）
- **WHEN** 创建争议时 `validationMode` 为 `ON_CHAIN` 或未指定
- **THEN** 使用链上验证模式
- **AND** 用户直接调用合约 `vote()` 函数时，合约验证 `token.balanceOf(msg.sender) >= minBalance`

#### Scenario: 链下验证模式
- **WHEN** 创建争议时 `validationMode` 为 `OFF_CHAIN`
- **THEN** 使用链下验证模式
- **AND** 服务端验证投票资格（基于 Agent 平台提供的余额信息或链上查询）
- **AND** 验证通过后，服务端调用合约 `voteOnBehalf()` 进行代理投票

#### Scenario: 使用自定义投票门槛
- **WHEN** 创建争议时指定了 `minBalance` 参数
- **THEN** 该争议使用指定的 `minBalance` 进行投票资格验证
- **AND** 其他争议不受影响，继续使用各自的配置

## ADDED Requirements

### Requirement: 争议创建时配置投票验证
系统 SHALL 允许在创建争议时配置投票验证模式和参数。

#### Scenario: API 接受投票配置参数
- **WHEN** Agent 平台调用 `POST /v1/disputes` 并包含投票配置字段
- **THEN** 服务端验证参数有效性
- **AND** 保存配置到数据库（`validationMode`、`minBalance`、`tokenAddress`、`voterBalancesJson`）

#### Scenario: 向后兼容
- **WHEN** Agent 平台调用 `POST /v1/disputes` 不包含投票配置字段
- **THEN** 使用默认配置（`validationMode = ON_CHAIN`，使用合约默认 `minBalance`）
- **AND** 行为与当前实现一致

### Requirement: 服务端投票API
系统 SHALL 提供服务端投票API端点，支持链下验证。

#### Scenario: 通过服务端API投票（链下验证）
- **WHEN** 用户调用 `POST /v1/disputes/:platformDisputeId/vote` 并包含 `voter` 和 `choice`
- **THEN** 服务端验证争议状态和投票资格
- **AND** 如果验证通过，服务端调用合约 `voteOnBehalf()` 进行代理投票
- **AND** 记录投票信息到数据库（包括 `validationMode` 和 `validatedBy`）

#### Scenario: 投票资格验证（链下模式）
- **WHEN** 争议使用链下验证模式（`validationMode = OFF_CHAIN`）
- **THEN** 服务端使用 Agent 平台提供的 `voterBalances` 或查询链上余额进行验证
- **AND** 验证 `voterBalance >= minBalance`

#### Scenario: 保留直接合约调用
- **WHEN** 用户直接调用合约 `vote()` 函数
- **THEN** 合约执行链上验证（`token.balanceOf(msg.sender) >= minBalance`）
- **AND** 行为与当前实现一致，不受链下验证影响

### Requirement: 合约代理投票功能
合约 SHALL 提供代理投票函数，允许授权地址代表用户投票。

#### Scenario: 管理员代理投票
- **WHEN** 授权地址（admin 或 authorizedVoters）调用 `voteOnBehalf(disputeId, voter, choice)`
- **THEN** 合约跳过余额检查（因为已在服务端验证）
- **AND** 记录投票并发出 `Voted` 事件
- **AND** 更新争议的投票计数

#### Scenario: 权限控制
- **WHEN** 非授权地址尝试调用 `voteOnBehalf()`
- **THEN** 合约回滚交易，抛出 `UNAUTHORIZED` 错误

