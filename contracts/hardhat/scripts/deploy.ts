import fs from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";

async function main() {
  const voteDuration = Number(process.env.VOTE_DURATION_SECONDS ?? "3600");
  const minBalance = process.env.MIN_BALANCE
    ? BigInt(process.env.MIN_BALANCE)
    : ethers.parseUnits("100", 18);

  let tokenAddress = process.env.TOKEN_ADDRESS;
  if (!tokenAddress) {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("Mock Token", "MOCK");
    await token.waitForDeployment();
    tokenAddress = token.target as string;
  }

  const DisputeVoting = await ethers.getContractFactory("DisputeVoting");
  const voting = await DisputeVoting.deploy(tokenAddress, minBalance, voteDuration);
  await voting.waitForDeployment();

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
