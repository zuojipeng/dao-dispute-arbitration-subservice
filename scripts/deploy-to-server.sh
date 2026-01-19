#!/bin/bash
# 在服务器上执行：更新配置并重启服务

set -e

echo "=== 更新服务器配置并重启服务 ==="

# 1. 拉取最新代码
echo "1. 拉取最新代码..."
git pull

# 2. 更新Sepolia配置
echo ""
echo "2. 更新Sepolia合约配置..."
if [ -f "scripts/update-sepolia-config.sh" ]; then
    bash scripts/update-sepolia-config.sh
else
    echo "警告: update-sepolia-config.sh 不存在，手动更新配置"
fi

# 3. 运行数据库迁移
echo ""
echo "3. 运行数据库迁移..."
docker run --rm \
  -v $(pwd):/app \
  -w /app \
  --env-file .env \
  node:20-bullseye \
  sh -c "corepack enable && pnpm install && pnpm --filter dao-service prisma migrate deploy"

# 4. 重启服务
echo ""
echo "4. 重启服务..."
docker compose restart dao-service dao-worker

echo ""
echo "=== 部署完成 ==="
echo ""
echo "查看服务状态:"
echo "  docker compose ps"
echo ""
echo "查看服务日志:"
echo "  docker compose logs -f dao-service"
echo ""
echo "测试API:"
echo "  curl http://localhost:3001/v1/disputes"

