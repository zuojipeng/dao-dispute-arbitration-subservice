#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { ethers } = require("ethers");

const ROOT = path.resolve(__dirname, "..", "..");
const KEEP_RUNNING = process.argv.includes("--keep") || process.env.E2E_KEEP === "1";
const HARDHAT_RPC = "http://127.0.0.1:8545";
const API_BASE = "http://127.0.0.1:3001";
const DEPLOYMENTS_FILE = path.join(
  ROOT,
  "contracts",
  "hardhat",
  "deployments",
  "localhost.json"
);
const ENV_E2E_FILE = path.join(ROOT, ".env.e2e");

const DEFAULT_PRIVATE_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945388cfb431d1008b7b206247f12cc4b1bfc8",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"
];

function log(message) {
  process.stdout.write(`[e2e] ${message}\n`);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      cwd: ROOT,
      ...options
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRpc(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] })
      });
      if (response.ok) {
        return;
      }
    } catch {
      // ignore
    }
    await sleep(500);
  }
  throw new Error(`RPC not responding at ${url}`);
}

async function waitForHttp(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404 || response.status === 405) {
        return;
      }
    } catch {
      // ignore
    }
    await sleep(500);
  }
  throw new Error(`HTTP not responding at ${url}`);
}

function parseEnvFile(filePath) {
  const env = {};
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) {
      continue;
    }
    const idx = line.indexOf("=");
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) {
      env[key] = value;
    }
  }
  return env;
}

function writeEnvFile(filePath, env) {
  const lines = Object.entries(env).map(([key, value]) => `${key}=${value}`);
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function signBody(rawBody, secret) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${timestamp}.${nonce}.${rawBody}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return { signature, timestamp, nonce };
}

async function apiRequest(method, pathName, body, secret) {
  const rawBody = body ? JSON.stringify(body) : "";
  const { signature, timestamp, nonce } = signBody(rawBody, secret);
  const response = await fetch(`${API_BASE}${pathName}`, {
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
    throw new Error(`API ${method} ${pathName} failed: ${response.status} ${text}`);
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

async function pollDispute(platformDisputeId, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const dispute = await getDispute(platformDisputeId);
    if (dispute.status === "RESOLVED") {
      return dispute;
    }
    await sleep(2000);
  }
  throw new Error("Timed out waiting for dispute to resolve");
}

async function main() {
  if (typeof fetch !== "function") {
    throw new Error("Node 18+ required (global fetch missing)");
  }

  log("starting hardhat node");
  const hardhat = spawn("pnpm", ["--filter", "contracts-hardhat", "run", "node"], {
    stdio: "inherit",
    cwd: ROOT
  });

  const shutdown = async () => {
    if (!KEEP_RUNNING) {
      try {
        await runCommand("docker", ["compose", "down"]);
      } catch {
        // ignore
      }
      if (!hardhat.killed) {
        hardhat.kill("SIGINT");
      }
    }
  };

  process.on("SIGINT", () => {
    shutdown().finally(() => process.exit(130));
  });
  process.on("SIGTERM", () => {
    shutdown().finally(() => process.exit(143));
  });

  try {
    await waitForRpc(HARDHAT_RPC, 30_000);
    log("deploying contracts to localhost");
    await runCommand("pnpm", ["--filter", "contracts-hardhat", "run", "deploy:localhost"]);

    if (!fs.existsSync(DEPLOYMENTS_FILE)) {
      throw new Error(`Missing deployments file at ${DEPLOYMENTS_FILE}`);
    }

    const deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, "utf8"));
    const baseEnv = parseEnvFile(path.join(ROOT, ".env.example"));
    const hmacSecret = baseEnv.HMAC_SECRET ?? "local-secret";
    const minBalance = deployments.minBalance ?? baseEnv.MIN_BALANCE ?? "1000000000000000000";

    const env = {
      ...baseEnv,
      CHAIN_ID: String(deployments.chainId ?? 31337),
      VOTING_CONTRACT: deployments.votingContract,
      TOKEN_CONTRACT: deployments.tokenContract,
      MIN_BALANCE: String(minBalance),
      START_BLOCK: String(deployments.startBlock ?? 0),
      SIGNER_PRIVATE_KEY: DEFAULT_PRIVATE_KEYS[4]
    };
    writeEnvFile(ENV_E2E_FILE, env);

    log("starting docker compose stack");
    await runCommand(
      "docker",
      ["compose", "up", "-d", "postgres", "webhook", "dao-service", "dao-worker"],
      { env: { ...process.env, ENV_FILE: ".env.e2e" } }
    );

    log("waiting for API");
    await waitForHttp(`${API_BASE}/v1/disputes`, 180_000);

    const platformDisputeId = `e2e-${Date.now()}`;
    const createPayload = {
      platformDisputeId,
      jobId: "job-1",
      billId: "bill-1",
      agentId: "agent-1",
      initiator: "agent",
      reason: "e2e test",
      evidenceUri: "https://example.com/evidence"
    };

    log("creating dispute via API");
    const created = await apiRequest("POST", "/v1/disputes", createPayload, hmacSecret);
    const disputeId = BigInt(created.contractDisputeId);

    log("minting tokens and voting");
    const provider = new ethers.JsonRpcProvider(HARDHAT_RPC);
    const minter = new ethers.Wallet(DEFAULT_PRIVATE_KEYS[1], provider);
    const agent = new ethers.Wallet(DEFAULT_PRIVATE_KEYS[2], provider);
    const user = new ethers.Wallet(DEFAULT_PRIVATE_KEYS[3], provider);
    const funder = new ethers.Wallet(DEFAULT_PRIVATE_KEYS[0], provider);
    const admin = new ethers.Wallet(DEFAULT_PRIVATE_KEYS[4], provider);

    const token = new ethers.Contract(
      deployments.tokenContract,
      ["function mint(address to, uint256 amount) external"],
      minter
    );
    const voting = new ethers.Contract(
      deployments.votingContract,
      ["function vote(uint256 disputeId, uint8 choice) external"],
      provider
    );

    const fundAmount = ethers.parseEther("1");
    await (await funder.sendTransaction({ to: minter.address, value: fundAmount })).wait();
    await (await funder.sendTransaction({ to: agent.address, value: fundAmount })).wait();
    await (await funder.sendTransaction({ to: user.address, value: fundAmount })).wait();
    await (await funder.sendTransaction({ to: admin.address, value: fundAmount })).wait();

    const mintAmount = BigInt(minBalance);
    await (await token.mint(agent.address, mintAmount)).wait();
    await (await token.mint(user.address, mintAmount)).wait();

    await (await voting.connect(agent).vote(disputeId, 1)).wait();
    await (await voting.connect(user).vote(disputeId, 2)).wait();

    log("force-finalizing dispute via API");
    await apiRequest(
      "POST",
      `/v1/disputes/${platformDisputeId}/force-finalize`,
      {},
      hmacSecret
    );

    log("waiting for indexer to resolve dispute");
    const resolved = await pollDispute(platformDisputeId, 90_000);

    log(
      `resolved: result=${resolved.result} votesAgent=${resolved.votesAgent} votesUser=${resolved.votesUser}`
    );
    if (resolved.votesAgent !== 1 || resolved.votesUser !== 1) {
      throw new Error("Unexpected vote totals in resolved dispute");
    }

    log("e2e flow completed");
  } finally {
    await shutdown();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
