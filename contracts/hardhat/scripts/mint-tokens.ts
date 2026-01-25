import { ethers } from "hardhat";

async function main() {
  console.log("开始mint MockERC20代币...");

  // 从部署清单读取合约地址
  const deployment = require("../deployments/sepolia.json");
  const tokenAddress = deployment.tokenContract;
  
  console.log(`Token合约地址: ${tokenAddress}`);

  // 连接到合约
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const token = MockERC20.attach(tokenAddress);

  // 要mint的地址（投票地址）
  const recipient = "0x16a22966d6d8f13d3d8a88d6d232682ecadcd045";
  
  // mint数量：1000个代币（带18位小数）
  const amount = ethers.parseEther("1000");

  console.log(`准备mint ${ethers.formatEther(amount)} tokens 到 ${recipient}`);

  // 执行mint
  const tx = await token.mint(recipient, amount);
  console.log(`交易已发送: ${tx.hash}`);
  
  const receipt = await tx.wait();
  console.log(`✅ Mint成功！区块号: ${receipt?.blockNumber}`);

  // 检查余额
  const balance = await token.balanceOf(recipient);
  console.log(`当前余额: ${ethers.formatEther(balance)} tokens`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


