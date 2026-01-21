# Disputes API Spec Delta

## MODIFIED Requirements

### Requirement: Dispute Creation API
系统 SHALL 接受平台争议创建请求并写入链上合约。

**修改内容**：增加platformId参数，关联平台配置

#### Scenario: 创建争议（带平台ID）
- **WHEN** Agent平台发送创建争议请求，包含platformId、platformDisputeId、jobId、billId等
- **THEN** 系统验证platformId存在
- **AND** 系统从Platform表获取tokenContract和minBalance配置
- **AND** 系统调用链上合约创建争议  
- **AND** 系统返回contractDisputeId、deadline和平台配置信息

#### Scenario: 平台不存在
- **WHEN** 创建争议时提供不存在的platformId
- **THEN** 系统返回400 Bad Request错误，说明平台不存在

#### Scenario: 重复创建幂等性（带平台）
- **WHEN** 相同platformId和platformDisputeId的争议已存在
- **THEN** 系统返回已有争议记录，不重复创建
- **AND** 返回的记录包含原平台配置

## MODIFIED Requirements

### Requirement: Vote Eligibility Verification
系统 SHALL 验证投票者的代币余额是否满足最小余额要求。

**修改内容**：根据争议所属平台动态查找代币合约

#### Scenario: 投票资格验证（平台代币）
- **WHEN** 用户对争议投票
- **THEN** 系统查找争议关联的平台
- **AND** 系统获取平台配置的tokenContract
- **AND** 系统查询投票者在该代币合约的余额
- **AND** 系统验证余额 >= 平台配置的minBalance
- **AND** 验证通过后代理投票到链上

#### Scenario: 余额不足（平台代币）
- **WHEN** 投票者在平台代币的余额 < minBalance
- **THEN** 系统返回400 Bad Request错误："Insufficient balance"
- **AND** 不调用链上合约

#### Scenario: 默认平台投票
- **WHEN** 争议未关联平台（历史数据兼容）
- **THEN** 系统使用DEFAULT_TOKEN_CONTRACT验证余额
- **AND** 使用DEFAULT_MIN_BALANCE作为阈值

## ADDED Requirements

### Requirement: Platform-filtered Dispute Query  
系统 SHALL 支持按平台过滤争议查询。

#### Scenario: 查询指定平台的争议
- **WHEN** 请求争议列表，传入platformId参数
- **THEN** 系统返回该平台的所有争议记录

#### Scenario: 争议详情包含平台信息
- **WHEN** 查询单个争议详情
- **THEN** 系统返回争议信息，包含关联的平台配置（名称、代币地址等）


