import assert from "node:assert/strict";
import { ethers } from "hardhat";

const CHOICE_AGENT = 1;
const CHOICE_USER = 2;

async function deployFixture() {
  const [owner, agentVoter, userVoter, lowBalanceVoter] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const token = await MockERC20.deploy("Mock Token", "MOCK");

  const minBalance = ethers.parseUnits("100", 18);
  await token.mint(agentVoter.address, minBalance);
  await token.mint(userVoter.address, minBalance);
  await token.mint(lowBalanceVoter.address, ethers.parseUnits("50", 18));

  const DisputeVoting = await ethers.getContractFactory("DisputeVoting");
  const voting = await DisputeVoting.deploy(token.target, minBalance, 3600);

  return { owner, agentVoter, userVoter, lowBalanceVoter, token, voting };
}

async function createDispute(voting: any, platformId: string) {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(platformId));
  const tx = await voting.createDispute(hash);
  const receipt = await tx.wait();
  const log = receipt?.logs.find((item: any) => item.fragment?.name === "DisputeCreated");
  assert.ok(log, "DisputeCreated event not found");
  return log.args.disputeId as bigint;
}

describe("DisputeVoting", function () {
  it("rejects voting when balance < minBalance", async function () {
    const { voting, lowBalanceVoter } = await deployFixture();
    const disputeId = await createDispute(voting, "low-balance");

    await assert.rejects(
      voting.connect(lowBalanceVoter).vote(disputeId, CHOICE_AGENT),
      (err: any) => err.message.includes("INSUFFICIENT_BALANCE")
    );
  });

  it("accepts voting when balance >= minBalance", async function () {
    const { voting, agentVoter } = await deployFixture();
    const disputeId = await createDispute(voting, "eligible-vote");

    await voting.connect(agentVoter).vote(disputeId, CHOICE_AGENT);
    const dispute = await voting.disputes(disputeId);
    assert.equal(dispute.votesAgent, 1n);
    assert.equal(dispute.votesUser, 0n);
  });

  it("prevents the same address from voting twice", async function () {
    const { voting, agentVoter } = await deployFixture();
    const disputeId = await createDispute(voting, "double-vote");

    await voting.connect(agentVoter).vote(disputeId, CHOICE_AGENT);
    await assert.rejects(
      voting.connect(agentVoter).vote(disputeId, CHOICE_AGENT),
      (err: any) => err.message.includes("ALREADY_VOTED")
    );
  });

  it("fails to finalize before the deadline", async function () {
    const { voting } = await deployFixture();
    const disputeId = await createDispute(voting, "too-early");

    await assert.rejects(
      voting.finalize(disputeId),
      (err: any) => err.message.includes("TOO_EARLY")
    );
  });

  it("finalizes after deadline and emits DisputeFinalized with correct result", async function () {
    const { voting, agentVoter } = await deployFixture();
    const disputeId = await createDispute(voting, "finalize-works");

    await voting.connect(agentVoter).vote(disputeId, CHOICE_AGENT);
    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);

    const tx = await voting.finalize(disputeId);
    const receipt = await tx.wait();
    const log = receipt?.logs.find((item: any) => item.fragment?.name === "DisputeFinalized");
    assert.ok(log, "DisputeFinalized event not found");
    assert.equal(log.args.result, 1n);
    assert.equal(log.args.votesAgent, 1n);
    assert.equal(log.args.votesUser, 0n);
  });

  it("resolves ties in favor of SUPPORT_USER", async function () {
    const { voting, agentVoter, userVoter } = await deployFixture();
    const disputeId = await createDispute(voting, "tie-breaker");

    await voting.connect(agentVoter).vote(disputeId, CHOICE_AGENT);
    await voting.connect(userVoter).vote(disputeId, CHOICE_USER);

    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);

    await voting.finalize(disputeId);
    const dispute = await voting.disputes(disputeId);
    assert.equal(dispute.result, 2n);
  });
});
