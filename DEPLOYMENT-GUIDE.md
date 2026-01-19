# EC2 部署指南

## 部署概况

✅ **已完成**：
- 代码已推送到远程仓库 (commit: ad733c9)
- 合约已部署到Sepolia测试网

🔧 **待完成**：
- 更新EC2服务器配置和代码

---

## 部署信息

### Sepolia合约部署信息
- **Chain ID**: 11155111
- **DisputeVoting合约**: `0x1DdDA662916e6e03548EAcBf5640AeCF55FFe582`
- **MockERC20合约**: `0x5D2F8D5aCEf44b8e7aC0c67696962ee93807db95`
- **起始区块**: 10078986
- **最小余额**: 100000000000000000000 (100 tokens)
- **投票时长**: 3600秒 (1小时)

### EC2服务器信息
- **公网IP**: 35.173.136.139
- **API地址**: http://35.173.136.139:3001
- **SSH密钥**: ~/Desktop/dao-dispute-key.pem
- **当前状态**: 服务运行中，但使用旧配置（本地测试网络）

---

## SSH连接问题

当前SSH连接超时，可能原因：
1. AWS安全组配置问题
2. EC2实例的SSH服务问题
3. 网络ACL配置

**临时解决方案**：
- 使用AWS Systems Manager Session Manager
- 使用AWS控制台的EC2 Instance Connect

---

## 部署步骤

### 方案一：使用AWS Systems Manager (推荐)

如果实例配置了SSM Agent，可以使用：

```bash
aws ssm start-session --target i-YOUR-INSTANCE-ID
```

然后执行以下命令。

### 方案二：使用AWS EC2 Instance Connect

1. 登录AWS控制台
2. 进入EC2 → 实例
3. 选择实例，点击"连接"
4. 选择"EC2 Instance Connect"
5. 点击"连接"

### 方案三：修复SSH后连接

检查AWS控制台中的安全组配置，确保：
- 入站规则包含SSH (端口22)
- 来源设置为你的IP或 0.0.0.0/0

修复后使用：
```bash
ssh -i ~/Desktop/dao-dispute-key.pem ubuntu@35.173.136.139
```

---

## 在服务器上执行的命令

连接到服务器后，执行以下命令：

### 1. 进入项目目录
```bash
cd ~/dao-dispute-arbitration-subservice
```

### 2. 拉取最新代码
```bash
git pull origin main
```

### 3. 备份当前.env文件
```bash
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
```

### 4. 更新.env文件

编辑.env文件，更新以下配置：

```bash
# 方式1：使用脚本自动更新
bash scripts/update-sepolia-config.sh
```

或手动更新：

```bash
# 方式2：手动编辑
nano .env
```

确保以下配置正确：
```env
# 链配置
CHAIN_ID=11155111
RPC_URL=https://sepolia.infura.io/v3/821589057d53470a897c135159744e70

# 合约地址
VOTING_CONTRACT=0x1DdDA662916e6e03548EAcBf5640AeCF55FFe582
TOKEN_CONTRACT=0x5D2F8D5aCEf44b8e7aC0c67696962ee93807db95

# 索引器配置
START_BLOCK=10078986

# 最小余额（可选，如果使用最小余额地图）
MIN_BALANCE=100000000000000000000

# 最小余额地图（如果需要特定地址的最小余额）
MIN_BALANCE_MAP={"0xdea48b60cc5bCC6170d6CD81964dE443a8015456":"5000000"}
```

### 5. 运行数据库迁移

```bash
docker run --rm \
  -v $(pwd):/app \
  -w /app \
  --env-file .env \
  node:20-bullseye \
  sh -c "corepack enable && pnpm install && pnpm --filter dao-service prisma migrate deploy"
```

### 6. 重启服务

```bash
# 方式1：使用docker compose
docker compose restart dao-service dao-worker

# 方式2：完全重启
docker compose down
docker compose up -d

# 方式3：使用启动脚本
./scripts/start-production.sh
```

### 7. 验证部署

```bash
# 查看服务状态
docker compose ps

# 查看服务日志
docker compose logs -f dao-service dao-worker

# 测试API（在服务器上）
curl http://localhost:3001/v1/disputes

# 查看环境变量
docker compose exec dao-service printenv | grep -E "(CHAIN_ID|VOTING_CONTRACT|START_BLOCK)"
```

---

## 验证部署（本地）

在本地终端执行：

```bash
# 1. 测试API可达性
curl http://35.173.136.139:3001/v1/disputes

# 2. 检查合约地址是否已更新
curl -s http://35.173.136.139:3001/v1/disputes | grep -o '"contractAddress":"[^"]*"'
# 应该显示: "contractAddress":"0x1DdDA662916e6e03548EAcBf5640AeCF55FFe582"

# 3. 检查链ID是否已更新
curl -s http://35.173.136.139:3001/v1/disputes | grep -o '"chainId":[0-9]*'
# 应该显示: "chainId":11155111
```

---

## 快速部署脚本（一键执行）

如果SSH连接正常，可以使用以下一键脚本：

```bash
# 本地执行（需要SSH可用）
ssh -i ~/Desktop/dao-dispute-key.pem ubuntu@35.173.136.139 'bash -s' < scripts/deploy-to-server.sh
```

或登录服务器后执行：

```bash
cd ~/dao-dispute-arbitration-subservice
bash scripts/deploy-to-server.sh
```

---

## 故障排查

### 问题1：数据库迁移失败
```bash
# 检查数据库连接
docker compose exec dao-service pnpm --filter dao-service prisma db pull

# 重置数据库（谨慎！会丢失数据）
docker compose exec dao-service pnpm --filter dao-service prisma migrate reset
```

### 问题2：服务启动失败
```bash
# 查看详细日志
docker compose logs --tail=100 dao-service

# 检查环境变量
docker compose exec dao-service printenv

# 重新构建镜像
docker compose build dao-service
docker compose up -d dao-service
```

### 问题3：API返回旧数据
```bash
# 清理旧数据并重新索引
docker compose exec dao-service pnpm --filter dao-service ts-node apps/dao-service/src/disputes/cleanup-zombie-disputes.ts

# 或手动清理数据库
docker compose exec dao-service pnpm --filter dao-service prisma studio
```

---

## 回滚步骤（如果需要）

如果新部署出现问题，可以回滚：

```bash
# 1. 恢复.env文件
cp .env.backup.XXXXXX .env

# 2. 回滚代码（可选）
git reset --hard HEAD~1

# 3. 重启服务
docker compose restart dao-service dao-worker
```

---

## 联系支持

如果遇到问题：
1. 检查AWS控制台的EC2实例状态
2. 查看CloudWatch日志
3. 使用AWS Support Center

---

## 完成清单

部署完成后，确认以下项目：

- [ ] SSH连接已修复或使用了替代方案
- [ ] 代码已更新到最新版本
- [ ] .env配置已更新（Chain ID, 合约地址, Start Block）
- [ ] 数据库迁移已成功运行
- [ ] 服务已重启
- [ ] API返回正确的合约地址（Sepolia）
- [ ] API返回正确的链ID (11155111)
- [ ] 服务日志无错误


