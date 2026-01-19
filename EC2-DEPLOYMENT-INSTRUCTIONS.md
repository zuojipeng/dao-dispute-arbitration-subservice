# EC2部署执行指令

## 当前状态

✅ **已完成**：
1. 代码已推送到GitHub仓库（commit: ad733c9）
2. 合约已部署到Sepolia测试网
   - DisputeVoting: `0x1DdDA662916e6e03548EAcBf5640AeCF55FFe582`
   - MockERC20: `0x5D2F8D5aCEf44b8e7aC0c67696962ee93807db95`
   - Start Block: 10078986

⚠️ **待完成**：
- 更新EC2服务器配置和代码（SSH连接暂时不可用）

---

## 连接问题

- **实例ID**: i-0b8439600101d2c91
- **状态**: running
- **问题**: SSH和SSM连接均失败
- **原因**: 可能是网络配置或安全组设置问题

---

## 解决方案

### 方案一：使用AWS控制台EC2 Instance Connect（推荐）

1. 打开AWS控制台：https://console.aws.amazon.com/ec2/
2. 切换到 **us-east-1** 区域
3. 进入 **EC2 → 实例**
4. 找到实例ID：**i-0b8439600101d2c91** (IP: 35.173.136.139)
5. 选中实例，点击上方的 **"连接"** 按钮
6. 选择 **"EC2 Instance Connect"** 标签页
7. 用户名保持默认：**ubuntu**
8. 点击 **"连接"** 按钮

这将打开一个浏览器内的终端。

### 方案二：修复SSH连接

#### 检查安全组：

1. 在EC2控制台，选中实例
2. 点击 **"安全"** 标签页
3. 点击安全组链接
4. 检查 **入站规则**：
   - 必须有 **SSH (22)** 端口规则
   - 来源应该是您的IP或 `0.0.0.0/0`

#### 如果没有SSH规则，添加规则：

1. 点击 **"编辑入站规则"**
2. 点击 **"添加规则"**
3. 类型：**SSH**
4. 端口：**22**
5. 来源：**0.0.0.0/0** （或您的IP/32以提高安全性）
6. 点击 **"保存规则"**
7. 等待10秒后，重试SSH连接：
   ```bash
   ssh -i ~/Desktop/dao-dispute-key.pem ubuntu@35.173.136.139
   ```

---

## 部署命令（在EC2实例上执行）

连接到实例后，按顺序执行以下命令：

### 1. 进入项目目录并拉取最新代码

```bash
cd ~/dao-dispute-arbitration-subservice
git pull origin main
```

### 2. 更新环境变量配置

**选项A：使用自动脚本（推荐）**

```bash
bash update-env-sepolia.sh
```

**选项B：手动更新.env文件**

```bash
# 备份当前配置
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# 编辑.env文件
nano .env
```

更新或添加以下配置项：

```env
CHAIN_ID=11155111
RPC_URL=https://sepolia.infura.io/v3/821589057d53470a897c135159744e70
VOTING_CONTRACT=0x1DdDA662916e6e03548EAcBf5640AeCF55FFe582
TOKEN_CONTRACT=0x5D2F8D5aCEf44b8e7aC0c67696962ee93807db95
START_BLOCK=10078986
MIN_BALANCE=100000000000000000000
MIN_BALANCE_MAP={"0xdea48b60cc5bCC6170d6CD81964dE443a8015456":"5000000"}
```

保存并退出（Ctrl+X, Y, Enter）

### 3. 验证配置

```bash
echo "检查配置："
grep -E "^(CHAIN_ID|VOTING_CONTRACT|START_BLOCK)=" .env
```

应该看到：
```
CHAIN_ID=11155111
VOTING_CONTRACT=0x1DdDA662916e6e03548EAcBf5640AeCF55FFe582
START_BLOCK=10078986
```

### 4. 运行数据库迁移

```bash
docker run --rm \
  -v $(pwd):/app \
  -w /app \
  --env-file .env \
  node:20-bullseye \
  sh -c "corepack enable && pnpm install && pnpm --filter dao-service prisma migrate deploy"
```

### 5. 重启服务

```bash
docker compose restart dao-service dao-worker
```

### 6. 查看服务状态和日志

```bash
# 查看服务状态
docker compose ps

# 查看最近的日志
docker compose logs --tail=50 dao-service dao-worker

# 持续查看日志（Ctrl+C退出）
docker compose logs -f dao-service dao-worker
```

### 7. 验证部署

```bash
# 在服务器上测试API
curl http://localhost:3001/v1/disputes

# 检查合约地址和链ID
curl -s http://localhost:3001/v1/disputes | grep -E '(contractAddress|chainId)'
```

---

## 本地验证（在你的电脑上执行）

```bash
# 测试API
curl http://35.173.136.139:3001/v1/disputes

# 检查配置是否正确（应该看到Sepolia的合约地址）
curl -s http://35.173.136.139:3001/v1/disputes | jq '.[0] | {chainId, contractAddress}' 2>/dev/null

# 或不使用jq
curl -s http://35.173.136.139:3001/v1/disputes | grep -o '"chainId":[^,]*' | head -1
curl -s http://35.173.136.139:3001/v1/disputes | grep -o '"contractAddress":"[^"]*"' | head -1
```

**预期结果**：
- chainId: 11155111 (Sepolia)
- contractAddress: 0x1DdDA662916e6e03548EAcBf5640AeCF55FFe582

---

## 快速部署（一键执行）

如果SSH恢复正常，可以使用：

```bash
ssh -i ~/Desktop/dao-dispute-key.pem ubuntu@35.173.136.139 << 'EOF'
cd ~/dao-dispute-arbitration-subservice
git pull origin main
bash update-env-sepolia.sh
docker run --rm -v $(pwd):/app -w /app --env-file .env node:20-bullseye sh -c "corepack enable && pnpm install && pnpm --filter dao-service prisma migrate deploy"
docker compose restart dao-service dao-worker
docker compose ps
echo ""
echo "部署完成！检查配置："
curl -s http://localhost:3001/v1/disputes | grep -E '(contractAddress|chainId)' | head -2
EOF
```

---

## 故障排查

### 问题1：git pull失败

```bash
# 检查git状态
git status

# 如果有本地修改，暂存它们
git stash

# 再次拉取
git pull origin main

# 如果需要，恢复暂存的修改
git stash pop
```

### 问题2：数据库迁移失败

```bash
# 检查数据库连接
docker compose exec dao-service pnpm --filter dao-service prisma db pull

# 查看当前迁移状态
docker compose exec dao-service pnpm --filter dao-service prisma migrate status

# 手动应用迁移
docker compose exec dao-service pnpm --filter dao-service prisma migrate deploy
```

### 问题3：服务无法启动

```bash
# 查看详细错误日志
docker compose logs --tail=100 dao-service

# 检查容器状态
docker compose ps

# 完全重启
docker compose down
docker compose up -d

# 查看启动日志
docker compose logs -f
```

### 问题4：API返回旧配置

```bash
# 确认环境变量已加载
docker compose exec dao-service printenv | grep -E "(CHAIN_ID|VOTING_CONTRACT)"

# 如果环境变量不对，需要完全重启
docker compose down
docker compose up -d
```

---

## 清理旧数据（可选）

如果需要清理本地测试网络的旧数据：

```bash
# 连接到数据库
docker compose exec dao-service pnpm --filter dao-service prisma studio

# 或使用清理脚本
docker compose exec dao-service pnpm --filter dao-service ts-node apps/dao-service/src/disputes/cleanup-zombie-disputes.ts
```

---

## 完成检查清单

- [ ] 已连接到EC2实例
- [ ] 已拉取最新代码
- [ ] 已更新.env配置（确认CHAIN_ID=11155111）
- [ ] 已运行数据库迁移
- [ ] 已重启服务
- [ ] API返回Sepolia链ID (11155111)
- [ ] API返回新的合约地址 (0x1DdDA662916e6e03548EAcBf5640AeCF55FFe582)
- [ ] 服务日志无错误

---

## 需要帮助？

如果遇到问题：

1. **查看服务日志**：`docker compose logs -f dao-service`
2. **检查环境变量**：`docker compose exec dao-service printenv | grep CHAIN`
3. **验证网络连接**：`curl https://sepolia.infura.io/v3/821589057d53470a897c135159744e70 -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'`
4. **回滚配置**：`cp .env.backup.TIMESTAMP .env && docker compose restart`


