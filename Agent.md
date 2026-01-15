# MANDATORY: Monorepo Bootstrap
You are starting from an empty folder. You MUST create a monorepo from scratch.
Do NOT create a single-app repo. Do NOT nest contracts inside the NestJS app.
Use pnpm workspaces.

Target structure (must match):
repo-root/
  pnpm-workspace.yaml
  package.json
  tsconfig.base.json (or equivalent)
  apps/
    dao-service/
  contracts/
    hardhat/
  infra/
    docker/
    aws/ (optional)
  packages/
    shared/ (optional)

Non-negotiable constraints:
1) Contracts MUST live under /contracts/hardhat (Hardhat + Solidity).
2) DAO service MUST live under /apps/dao-service (NestJS + Prisma).
3) Voting eligibility MUST be enforced on-chain in vote() via ERC20 balance >= minBalance.
4) DAO service MUST NOT custody user private keys. Users vote via wallet directly to contract.
5) V1: No snapshot/lock/weighted voting. Keep it simple.
6) After each milestone: print repo tree (max depth 4).

----------------------------------------------------------------
PROJECT GOAL (V1)
- Agent Platform creates disputes via DAO Service API.
- DAO Service writes dispute to chain via Voting Contract.
- Users vote via wallet directly to contract; contract enforces eligibility (ERC20 balance threshold).
- DAO Service indexes chain events into Postgres and runs a finalizer cron to finalize after deadline.
- DAO Service sends a webhook callback to Agent Platform with result + txHash.
- Agent Platform updates Job/Bill and handles funds (out of scope here).
----------------------------------------------------------------

========================
MILESTONE 1 — Workspace Initialization
========================
Goal:
- Create pnpm monorepo skeleton with basic tooling.

Actions:
- Create pnpm-workspace.yaml including apps/*, contracts/*, packages/*.
- Create root package.json with scripts:
  - "lint" (placeholder)
  - "test" (runs contracts + service tests)
  - "build" (build all)
- Create tsconfig.base.json (shared TS config).

Outputs:
- pnpm-workspace.yaml
- package.json
- tsconfig.base.json
- directories: apps/, contracts/, infra/docker/, packages/shared/

Acceptance:
- `pnpm -v` works (assume available).
- Repo tree matches target structure at depth 2.

After done:
- Print repo tree (depth 4).

========================
MILESTONE 2 — Hardhat Project Bootstrap
========================
Goal:
- Initialize Hardhat project under /contracts/hardhat with TS support and basic scripts.

Actions:
- Initialize Hardhat project (TypeScript).
- Add scripts in /contracts/hardhat/package.json:
  - test, compile, lint (optional), deploy:sepolia (placeholder), deploy:local
- Create a minimal ERC20 mock token contract for tests (MockERC20.sol) or use OpenZeppelin ERC20 for mock.

Outputs:
- contracts/hardhat/{hardhat.config.ts, package.json, contracts/, test/, scripts/}

Acceptance:
- `pnpm --filter contracts-hardhat test` (or equivalent) can run (may have 0 tests yet).

After done:
- Print repo tree (depth 4).

========================
MILESTONE 3 — Voting Contract Implementation (DisputeVoting.sol)
========================
Goal:
- Implement V1 Voting Contract with eligibility check.

Contract requirements:
- Constructor parameters: tokenAddress, minBalance, voteDurationSeconds.
- Data model:
  - disputes indexed by uint256 disputeId
  - store platformDisputeIdHash (bytes32) and deadline
  - votesAgent, votesUser
  - finalized flag and result enum/int
  - hasVoted[disputeId][address]
- Functions:
  - createDispute(bytes32 platformDisputeIdHash) returns (uint256 disputeId)
  - vote(uint256 disputeId, uint8 choice)
      require ERC20(token).balanceOf(msg.sender) >= minBalance
      require !hasVoted
  - finalize(uint256 disputeId)
      require block.timestamp >= deadline
      compute result:
        if votesAgent > votesUser => SUPPORT_AGENT else SUPPORT_USER (ties go to SUPPORT_USER)
- Events:
  - DisputeCreated(disputeId, platformDisputeIdHash, deadline)
  - Voted(disputeId, voter, choice)
  - DisputeFinalized(disputeId, result, votesAgent, votesUser)

Actions:
- Implement DisputeVoting.sol.
- Export ABI artifacts (default Hardhat artifacts).

Outputs:
- contracts/hardhat/contracts/DisputeVoting.sol

Acceptance:
- `pnpm --filter contracts-hardhat compile` succeeds.

After done:
- Print repo tree (depth 4).

========================
MILESTONE 4 — Contract Tests
========================
Goal:
- Add essential unit tests to prevent regressions.

Tests MUST cover:
- voting fails when balance < minBalance
- voting succeeds when balance >= minBalance
- same address cannot vote twice in same dispute
- finalize fails before deadline
- finalize succeeds after deadline and emits DisputeFinalized with correct result
- tie => SUPPORT_USER

Actions:
- Write tests in TypeScript under contracts/hardhat/test/.
- Use mock ERC20 token minted to voters for eligibility tests.

Acceptance:
- `pnpm --filter contracts-hardhat test` passes.

After done:
- Print repo tree (depth 4).

========================
MILESTONE 5 — Deploy Scripts + Deploy Manifest
========================
Goal:
- Create deploy scripts and a manifest file for service consumption.

Actions:
- scripts/deploy.ts that deploys MockERC20 (optional for local), then DisputeVoting.
- Write deployment output to a JSON manifest:
  - chainId, votingContract, tokenContract, minBalance, voteDuration, startBlock
- Place manifest at:
  - contracts/hardhat/deployments/local.json (and/or sepolia.json)

Acceptance:
- `pnpm --filter contracts-hardhat run deploy:local` deploys to local hardhat network and produces manifest.

After done:
- Print repo tree (depth 4).

========================
MILESTONE 6 — NestJS DAO Service Bootstrap
========================
Goal:
- Initialize NestJS project under /apps/dao-service and wire shared TS config.

Actions:
- Create NestJS app with modules:
  - disputes, chain, callbacks, auth, prisma
- Add scripts:
  - dev, build, test, start:worker
- Add config validation (zod/joi) for env vars:
  - DATABASE_URL, RPC_URL, CHAIN_ID, VOTING_CONTRACT, TOKEN_CONTRACT,
    MIN_BALANCE, PLATFORM_WEBHOOK_URL, HMAC_SECRET, START_BLOCK
- Add Prisma setup and connect to Postgres.

Outputs:
- apps/dao-service/*

Acceptance:
- `pnpm --filter dao-service build` succeeds.

After done:
- Print repo tree (depth 4).

========================
MILESTONE 7 — Prisma Models + Migrations
========================
Goal:
- Implement DB schema for disputes/votes cache.

Models:
- Dispute:
  - id(uuid), platformDisputeId(unique), jobId, billId, agentId, initiator, reason, evidenceUri
  - chainId, contractAddress, contractDisputeId(bigint), deadline(datetime)
  - status (VOTING/RESOLVED), result, finalizeTxHash
  - callbackStatus (PENDING/SENT/FAILED)
- Vote:
  - id, disputeId FK, voter(address), choice, txHash, blockNumber
  - unique(disputeId, voter)

Actions:
- Create schema.prisma
- Run migration
- Provide seed script (optional)

Acceptance:
- `pnpm --filter dao-service prisma migrate dev` works (assume local Postgres via docker).

After done:
- Print repo tree (depth 4).

========================
MILESTONE 8 — DAO Service APIs (Dispute + Read)
========================
Goal:
- Provide platform-facing API for creating disputes and querying status.

Endpoints:
- POST /v1/disputes  (HMAC required)
  - idempotent by platformDisputeId
  - call contract.createDispute(platformDisputeIdHash)
  - store contractDisputeId, deadline
- GET /v1/disputes (list by status, pagination)
- GET /v1/disputes/:platformDisputeId (details)

Auth (minimum):
- Implement HMAC guard for POST (and optional admin finalize endpoint).
- timestamp drift <= 300s
- nonce anti-replay (use DB table or Redis)

Acceptance:
- Local run: create dispute returns expected JSON including contractDisputeId and deadline.
- Repeating the same platformDisputeId does not create a new on-chain dispute.

After done:
- Print repo tree (depth 4).

========================
MILESTONE 9 — Chain Indexer Worker + Finalizer Cron + Callback
========================
Goal:
- Make the system autonomous: index events, finalize at deadline, and callback platform.

Indexer:
- Read deployment manifest (or env) for startBlock.
- Use queryFilter loop with persisted cursor (DB table) OR re-scan from startBlock at boot (V1 ok if small).
- Handle events:
  - DisputeCreated: update dispute status=VOTING, store deadline/contractDisputeId
  - Voted: upsert vote and update counts
  - DisputeFinalized: mark dispute RESOLVED, store result, finalizeTxHash

Finalizer:
- Cron every minute:
  - find disputes where deadline < now and not resolved
  - call contract.finalize(contractDisputeId)
  - on success, wait for Finalized event or receipt

Callback:
- POST to PLATFORM_WEBHOOK_URL with:
  platformDisputeId, jobId, billId, result, votesAgent, votesUser, txHash, chainId, contractAddress, contractDisputeId
- Implement retry with exponential backoff and max attempts.
- Mark callbackStatus accordingly.

Acceptance:
- When a dispute reaches deadline, it gets finalized automatically.
- Callback is sent (use a local mock server for webhook).
- Re-running worker does not duplicate votes or disputes in DB (idempotency).

After done:
- Print repo tree (depth 4).

========================
MILESTONE 10 — Local E2E Harness + Docker Compose
========================
Goal:
- Provide a runnable local environment for end-to-end verification.

Actions:
- Add docker-compose.yml at repo root:
  - postgres
  - optional redis
  - dao-service api
  - dao-service worker
- Provide ENV.example at repo root (or in apps/dao-service).
- Provide a simple mock webhook receiver (tiny node script) to verify callbacks.

E2E Flow (must be documented in README):
1) Start compose
2) Deploy contracts to local network (or use hardhat node)
3) POST /v1/disputes (with HMAC)
4) Vote with eligible wallet (hardhat account with tokens)
5) Fast-forward time to deadline
6) Observe finalize + callback payload

Acceptance:
- A new engineer can run E2E with documented commands.
- All tests pass:
  - pnpm --filter contracts-hardhat test
  - pnpm --filter dao-service test (if any)

After done:
- Print repo tree (depth 4).

----------------------------------------------------------------
RULES DURING EXECUTION
- After finishing each milestone, provide:
  1) What was done
  2) How to run/verify
  3) Repo tree depth<=4
- Do not start the next milestone until the current milestone acceptance passes (or you explain precisely why it cannot).

----------------------------------------------------------------
PROGRESS LOG
----------------------------------------------------------------
2025-01-10
- M1: Workspace initialization complete.
- M2: Hardhat project bootstrap complete.
- M3: DisputeVoting.sol implemented; compile verified by user.
- M4: Contract tests added; pnpm --filter contracts-hardhat test passed.
- M5: Deploy script + manifest complete; deploy:local generated deployments/local.json.
- M6: NestJS dao-service scaffolded with config validation + Prisma service; build passed.
- M7: Prisma models added; migration applied to RDS (init).
- M8: Disputes API + HMAC guard + chain createDispute wiring implemented; runtime verified (POST+GET), idempotent re-POST verified.

2025-01-15
- M9: Worker module added with chain indexer, finalizer cron, and webhook callback retry processor.
- M10: Added docker-compose, .env.example, and mock webhook receiver; README updated with E2E steps.

Extension tasks (later)
- Add WebhookAttempt + Nonce persistence models and migrate.
