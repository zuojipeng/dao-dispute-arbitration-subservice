#!/bin/bash
# 更新Sepolia合约配置脚本

set -e

echo "=== 更新Sepolia合约配置 ==="

# 从部署文件读取配置
DEPLOYMENT_FILE="contracts/hardhat/deployments/sepolia.json"

if [ ! -f "$DEPLOYMENT_FILE" ]; then
    echo "错误: 部署文件不存在: $DEPLOYMENT_FILE"
    exit 1
fi

# 解析部署信息
CHAIN_ID=$(cat "$DEPLOYMENT_FILE" | grep -o '"chainId": [0-9]*' | grep -o '[0-9]*')
VOTING_CONTRACT=$(cat "$DEPLOYMENT_FILE" | grep -o '"votingContract": "[^"]*"' | cut -d'"' -f4)
TOKEN_CONTRACT=$(cat "$DEPLOYMENT_FILE" | grep -o '"tokenContract": "[^"]*"' | cut -d'"' -f4)
START_BLOCK=$(cat "$DEPLOYMENT_FILE" | grep -o '"startBlock": [0-9]*' | grep -o '[0-9]*')
MIN_BALANCE=$(cat "$DEPLOYMENT_FILE" | grep -o '"minBalance": "[^"]*"' | cut -d'"' -f4)

echo "读取到的配置:"
echo "  CHAIN_ID: $CHAIN_ID"
echo "  VOTING_CONTRACT: $VOTING_CONTRACT"
echo "  TOKEN_CONTRACT: $TOKEN_CONTRACT"
echo "  START_BLOCK: $START_BLOCK"
echo "  MIN_BALANCE: $MIN_BALANCE"
echo ""

# 检查.env文件
if [ ! -f .env ]; then
    echo "错误: .env 文件不存在"
    exit 1
fi

# 备份.env文件
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
echo "已备份.env文件"

# 更新环境变量
echo "更新.env文件..."

# 使用sed更新或添加配置
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

# 更新RPC_URL为Sepolia（如果存在）
if grep -q "^RPC_URL=" .env; then
    if ! grep -q "sepolia" .env | grep -q "RPC_URL"; then
        echo "提示: 请确保RPC_URL指向Sepolia测试网"
    fi
fi

echo ""
echo "=== 配置更新完成 ==="
echo ""
echo "更新的配置:"
grep -E "^(CHAIN_ID|VOTING_CONTRACT|TOKEN_CONTRACT|START_BLOCK|MIN_BALANCE)=" .env
echo ""
echo "下一步: 重启服务"
echo "  docker compose restart dao-service dao-worker"
echo "  或"
echo "  ./scripts/start-production.sh"


