import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import path from "path";
import fs from "fs";

// 手动加载项目根目录的 .env 文件（如果存在）
const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const match = trimmed.match(/^([^=:#\s]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // 移除引号
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
}

// 处理私钥，确保有 0x 前缀
const getPrivateKey = (key: string | undefined): string | undefined => {
  if (!key) return undefined;
  const trimmed = key.trim();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
};

const privateKey = getPrivateKey(process.env.SIGNER_PRIVATE_KEY);
const sepoliaAccounts = privateKey ? [privateKey] : [];
if (sepoliaAccounts.length === 0) {
  console.warn("警告: SIGNER_PRIVATE_KEY 未设置，将使用默认账户（仅适用于本地网络）");
}

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/821589057d53470a897c135159744e70",
      accounts: sepoliaAccounts,
      chainId: 11155111
    }
  }
};

export default config;
