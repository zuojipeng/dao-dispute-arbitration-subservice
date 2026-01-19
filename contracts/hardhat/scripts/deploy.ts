import fs from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";

async function main() {
  // 检查环境变量
  const hasSignerKey = !!process.env.SIGNER_PRIVATE_KEY;
  console.log(`SIGNER_PRIVATE_KEY ${hasSignerKey ? "已设置" : "未设置"}`);
  
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No signers available. Please set SIGNER_PRIVATE_KEY environment variable.");
  }
  const deployer = signers[0];
  console.log("Deploying contracts with account:", deployer.address);
  
  // 检查余额
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Account balance: ${ethers.formatEther(balance)} ETH`);
  
  if (balance === 0n) {
    throw new Error("Account has zero balance. Please fund the account with Sepolia ETH.");
  }

  const voteDuration = Number(process.env.VOTE_DURATION_SECONDS ?? "3600");
  const minBalance = process.env.MIN_BALANCE
    ? BigInt(process.env.MIN_BALANCE)
    : ethers.parseUnits("100", 18);

  let tokenAddress = process.env.TOKEN_ADDRESS;
  if (!tokenAddress) {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.connect(deployer).deploy("Mock Token", "MOCK");
    await token.waitForDeployment();
    tokenAddress = token.target as string;
    console.log("MockERC20 deployed to:", tokenAddress);
  }

  const DisputeVoting = await ethers.getContractFactory("DisputeVoting");
  const voting = await DisputeVoting.connect(deployer).deploy(tokenAddress, minBalance, voteDuration);
  await voting.waitForDeployment();
  console.log("DisputeVoting deployed to:", voting.target);

  const receipt = await voting.deploymentTransaction()?.wait();
  const startBlock = receipt?.blockNumber ?? 0;
  const chainId = (await ethers.provider.getNetwork()).chainId;

  const manifest = {
    chainId: Number(chainId),
    votingContract: voting.target as string,
    tokenContract: tokenAddress,
    minBalance: minBalance.toString(),
    voteDuration,
    startBlock
  };

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });

  const manifestName = network.name === "hardhat" ? "local" : network.name;
  const outFile = path.join(outDir, `${manifestName}.json`);
  fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2));
  console.log(`Wrote deployment manifest to ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
