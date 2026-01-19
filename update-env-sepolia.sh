#!/bin/bash
# 在EC2服务器上执行：更新环境变量到Sepolia配置
# 使用方法：bash update-env-sepolia.sh

set -e

echo "=== 更新EC2环境变量到Sepolia配置 ==="
echo ""

# 检查.env文件是否存在
if [ ! -f .env ]; then
    echo "错误: .env 文件不存在"
    exit 1
fi

# 备份当前.env文件
BACKUP_FILE=".env.backup.$(date +%Y%m%d_%H%M%S)"
cp .env "$BACKUP_FILE"
echo "✅ 已备份.env文件到: $BACKUP_FILE"
echo ""

# 定义Sepolia配置
CHAIN_ID="11155111"
VOTING_CONTRACT="0x1DdDA662916e6e03548EAcBf5640AeCF55FFe582"
TOKEN_CONTRACT="0x5D2F8D5aCEf44b8e7aC0c67696962ee93807db95"
START_BLOCK="10078986"
MIN_BALANCE="100000000000000000000"
RPC_URL="https://sepolia.infura.io/v3/821589057d53470a897c135159744e70"
MIN_BALANCE_MAP='{"0xdea48b60cc5bCC6170d6CD81964dE443a8015456":"5000000"}'

echo "将更新以下配置："
echo "  CHAIN_ID: $CHAIN_ID"
echo "  VOTING_CONTRACT: $VOTING_CONTRACT"
echo "  TOKEN_CONTRACT: $TOKEN_CONTRACT"
echo "  START_BLOCK: $START_BLOCK"
echo "  RPC_URL: $RPC_URL"
echo "  MIN_BALANCE: $MIN_BALANCE"
echo "  MIN_BALANCE_MAP: $MIN_BALANCE_MAP"
echo ""

# 更新或添加配置函数
update_or_add() {
    local key="$1"
    local value="$2"
    
    if grep -q "^${key}=" .env; then
        # macOS和Linux兼容的sed命令
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^${key}=.*|${key}=${value}|" .env
        else
            sed -i "s|^${key}=.*|${key}=${value}|" .env
        fi
        echo "  ✅ 已更新: $key"
    else
        echo "${key}=${value}" >> .env
        echo "  ✅ 已添加: $key"
    fi
}

echo "正在更新.env文件..."
update_or_add "CHAIN_ID" "$CHAIN_ID"
update_or_add "VOTING_CONTRACT" "$VOTING_CONTRACT"
update_or_add "TOKEN_CONTRACT" "$TOKEN_CONTRACT"
update_or_add "START_BLOCK" "$START_BLOCK"
update_or_add "RPC_URL" "$RPC_URL"
update_or_add "MIN_BALANCE" "$MIN_BALANCE"
update_or_add "MIN_BALANCE_MAP" "$MIN_BALANCE_MAP"

echo ""
echo "=== 配置更新完成 ==="
echo ""
echo "更新后的Sepolia配置："
grep -E "^(CHAIN_ID|VOTING_CONTRACT|TOKEN_CONTRACT|START_BLOCK|RPC_URL|MIN_BALANCE)=" .env
echo ""
echo "下一步："
echo "  1. 运行数据库迁移（如果需要）："
echo "     bash scripts/server-update-commands.sh migrate"
echo ""
echo "  2. 重启服务："
echo "     docker compose restart dao-service dao-worker"
echo ""
echo "如需回滚，使用备份文件："
echo "  cp $BACKUP_FILE .env"
echo ""

