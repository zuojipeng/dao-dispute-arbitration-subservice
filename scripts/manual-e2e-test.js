#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const { ethers } = require("ethers");

const API_BASE = "http://127.0.0.1:3001";
const HARDHAT_RPC = "http://127.0.0.1:8545";
const HMAC_SECRET = "local-secret";

// Hardhat default accounts
const PRIVATE_KEYS = {
  minter: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // Account #1
  agent: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",  // Account #2
  user: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",   // Account #3
  funder: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"  // Account #0
};

const CONTRACTS = {
  token: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  voting: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
};

const MIN_BALANCE = "100000000000000000000"; // 100 tokens

function log(message) {
  console.log(`[Manual E2E] ${message}`);
}

function signBody(rawBody, secret) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${timestamp}.${nonce}.${rawBody}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return { signature, timestamp, nonce };
}

async function apiRequest(method, pathname, body) {
  const rawBody = body ? JSON.stringify(body) : "";
  const { signature, timestamp, nonce } = signBody(rawBody, HMAC_SECRET);
  
  const response = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-signature": signature,
      "x-timestamp": timestamp,
      "x-nonce": nonce
    },
    body: rawBody || undefined
  });
  
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`API ${method} ${pathname} failed: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function getDispute(platformDisputeId) {
  const response = await fetch(`${API_BASE}/v1/disputes/${platformDisputeId}`);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GET dispute failed: ${response.status} ${text}`);
  }
  return JSON.parse(text);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  log("开始手动 E2E 测试");
  
  // 初始化 ethers
  const provider = new ethers.JsonRpcProvider(HARDHAT_RPC);
  const minter = new ethers.Wallet(PRIVATE_KEYS.minter, provider);
  const agent = new ethers.Wallet(PRIVATE_KEYS.agent, provider);
  const user = new ethers.Wallet(PRIVATE_KEYS.user, provider);
  const funder = new ethers.Wallet(PRIVATE_KEYS.funder, provider);
  
  log(`Minter地址: ${minter.address}`);
  log(`Agent地址: ${agent.address}`);
  log(`User地址: ${user.address}`);
  
  // 步骤 1: 创建争议
  log("\n步骤 1: 创建争议");
  const platformDisputeId = `manual-e2e-${Date.now()}`;
  const createPayload = {
    platformDisputeId,
    jobId: "job-test",
    billId: "bill-test",
    agentId: "agent-test",
    initiator: "agent",
    reason: "Manual E2E test",
    evidenceUri: "https://example.com/evidence"
  };
  
  const created = await apiRequest("POST", "/v1/disputes", createPayload);
  log(`✅ 争议已创建: ${created.platformDisputeId}`);
  log(`   Contract Dispute ID: ${created.contractDisputeId}`);
  log(`   Deadline: ${created.deadline}`);
  log(`   Status: ${created.status}`);
  
  const disputeId = BigInt(created.contractDisputeId);
  
  // 步骤 2: 给投票者转账 Gas 费
  log("\n步骤 2: 给投票者转账 Gas 费");
  const fundAmount = ethers.parseEther("1");
  
  // 获取当前 nonce 并批量发送
  let nonce = await provider.getTransactionCount(funder.address);
  await (await funder.sendTransaction({ to: minter.address, value: fundAmount, nonce: nonce++ })).wait();
  await (await funder.sendTransaction({ to: agent.address, value: fundAmount, nonce: nonce++ })).wait();
  await (await funder.sendTransaction({ to: user.address, value: fundAmount, nonce: nonce++ })).wait();
  log(`✅ Gas 费已转账`);
  
  // 步骤 3: Mint 代币
  log("\n步骤 3: Mint 投票代币");
  const token = new ethers.Contract(
    CONTRACTS.token,
    ["function mint(address to, uint256 amount) external"],
    minter
  );
  
  const mintAmount = BigInt(MIN_BALANCE);
  let minterNonce = await provider.getTransactionCount(minter.address);
  await (await token.mint(agent.address, mintAmount, { nonce: minterNonce++ })).wait();
  await (await token.mint(user.address, mintAmount, { nonce: minterNonce++ })).wait();
  log(`✅ 代币已 mint: ${ethers.formatEther(mintAmount)} tokens 给 agent 和 user`);
  
  // 步骤 4: 投票
  log("\n步骤 4: 链上投票");
  const voting = new ethers.Contract(
    CONTRACTS.voting,
    ["function vote(uint256 disputeId, uint8 choice) external"],
    provider
  );
  
  log(`   Agent 投票支持 Agent (choice=1)...`);
  await (await voting.connect(agent).vote(disputeId, 1)).wait();
  log(`   ✅ Agent 已投票`);
  
  log(`   User 投票支持 User (choice=2)...`);
  await (await voting.connect(user).vote(disputeId, 2)).wait();
  log(`   ✅ User 已投票`);
  
  // 步骤 5: 等待 Indexer 扫描
  log("\n步骤 5: 等待 Indexer 扫描投票事件 (10秒)...");
  await sleep(10000);
  
  let dispute = await getDispute(platformDisputeId);
  log(`   当前状态: ${dispute.status}`);
  log(`   投票统计: Agent=${dispute.votesAgent}, User=${dispute.votesUser}`);
  
  // 步骤 6: Force Finalize
  log("\n步骤 6: Force Finalize 争议");
  await apiRequest("POST", `/v1/disputes/${platformDisputeId}/force-finalize`, {});
  log(`✅ Force finalize 请求已发送`);
  
  // 步骤 7: 等待 Indexer 扫描 Finalize 事件
  log("\n步骤 7: 等待 Indexer 扫描 Finalize 事件 (15秒)...");
  await sleep(15000);
  
  // 步骤 8: 验证最终结果
  log("\n步骤 8: 验证最终结果");
  dispute = await getDispute(platformDisputeId);
  
  log(`\n=== 最终结果 ===`);
  log(`状态: ${dispute.status}`);
  log(`结果: ${dispute.result}`);
  log(`投票统计: Agent=${dispute.votesAgent}, User=${dispute.votesUser}`);
  log(`Finalize交易: ${dispute.finalizeTxHash}`);
  log(`回调状态: ${dispute.callbackStatus}`);
  
  // 验证
  const success = 
    dispute.status === "RESOLVED" &&
    dispute.result === "SUPPORT_USER" &&  // 平票支持 User
    dispute.votesAgent === 1 &&
    dispute.votesUser === 1 &&
    dispute.finalizeTxHash;
  
  if (success) {
    log(`\n✅✅✅ E2E 测试完全通过！ ✅✅✅`);
  } else {
    log(`\n❌ E2E 测试失败，结果不符合预期`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error("❌ 测试失败:", error);
  process.exitCode = 1;
});

