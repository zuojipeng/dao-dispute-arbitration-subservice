#!/bin/bash
# 在服务器上执行这些命令来更新配置

# 根据部署信息更新配置
CHAIN_ID=11155111
VOTING_CONTRACT=0x65AE39021Ff937f65d154A1f155952e099d5BF5d
TOKEN_CONTRACT=0x98dfA99808e41cE269Cc7296B8721720CF393be9
START_BLOCK=10068216
MIN_BALANCE=100000000000000000000

echo "=== 更新服务器配置 ==="

# 进入项目目录
cd dao-dispute-arbitration-subservice || exit 1

# 拉取最新代码
git pull

# 备份.env文件
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# 更新环境变量
if grep -q "^CHAIN_ID=" .env; then
    sed -i "s|^CHAIN_ID=.*|CHAIN_ID=$CHAIN_ID|" .env
else
    echo "CHAIN_ID=$CHAIN_ID" >> .env
fi

if grep -q "^VOTING_CONTRACT=" .env; then
    sed -i "s|^VOTING_CONTRACT=.*|VOTING_CONTRACT=$VOTING_CONTRACT|" .env
else
    echo "VOTING_CONTRACT=$VOTING_CONTRACT" >> .env
fi

if grep -q "^TOKEN_CONTRACT=" .env; then
    sed -i "s|^TOKEN_CONTRACT=.*|TOKEN_CONTRACT=$TOKEN_CONTRACT|" .env
else
    echo "TOKEN_CONTRACT=$TOKEN_CONTRACT" >> .env
fi

if grep -q "^START_BLOCK=" .env; then
    sed -i "s|^START_BLOCK=.*|START_BLOCK=$START_BLOCK|" .env
else
    echo "START_BLOCK=$START_BLOCK" >> .env
fi

if grep -q "^MIN_BALANCE=" .env; then
    sed -i "s|^MIN_BALANCE=.*|MIN_BALANCE=$MIN_BALANCE|" .env
else
    echo "MIN_BALANCE=$MIN_BALANCE" >> .env
fi

# 确保RPC_URL指向Sepolia（如果存在）
if grep -q "^RPC_URL=" .env; then
    if ! grep "^RPC_URL=" .env | grep -q "sepolia"; then
        echo "提示: 请检查RPC_URL是否指向Sepolia测试网"
    fi
fi

echo ""
echo "配置已更新，验证:"
grep -E "^(CHAIN_ID|VOTING_CONTRACT|TOKEN_CONTRACT|START_BLOCK|MIN_BALANCE)=" .env

echo ""
echo "运行数据库迁移..."
docker run --rm \
  -v $(pwd):/app \
  -w /app \
  --env-file .env \
  node:20-bullseye \
  sh -c "corepack enable && pnpm install && pnpm --filter dao-service prisma migrate deploy"

echo ""
echo "重启服务..."
docker compose restart dao-service dao-worker

echo ""
echo "=== 完成 ==="
echo "查看服务状态: docker compose ps"
echo "查看日志: docker compose logs -f dao-service"


