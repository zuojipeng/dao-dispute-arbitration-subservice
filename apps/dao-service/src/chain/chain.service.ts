import { Injectable, Logger } from "@nestjs/common";
import { ethers } from "ethers";
import { ConfigService } from "../config/config.service";

const VOTING_ABI = [
  "event DisputeCreated(uint256 indexed disputeId, bytes32 platformDisputeIdHash, uint256 deadline)",
  "event Voted(uint256 indexed disputeId, address indexed voter, uint8 choice)",
  "event DisputeFinalized(uint256 indexed disputeId, uint8 result, uint256 votesAgent, uint256 votesUser)",
  "function createDispute(bytes32 platformDisputeIdHash) returns (uint256)",
  "function finalize(uint256 disputeId)",
  "function forceFinalize(uint256 disputeId)",
  "function voteOnBehalf(uint256 disputeId, address voter, uint8 choice)"
];

// RPC 和交易超时配置
const RPC_TIMEOUT_MS = 30000;      // RPC 调用超时: 30 秒
const TX_SEND_TIMEOUT_MS = 10000;  // 发送交易超时: 10 秒
const TX_WAIT_TIMEOUT_MS = 60000;  // 等待交易确认超时: 60 秒

@Injectable()
export class ChainService {
  private readonly logger = new Logger(ChainService.name);
  private readonly provider: ethers.JsonRpcProvider;
  private readonly contractAddress: string;
  private readonly wallet?: ethers.Wallet;
  private readonly iface: ethers.Interface;

  constructor(private readonly configService: ConfigService) {
    const config = this.configService.get();
    
    // 创建带超时配置的 Provider
    const fetchReq = new ethers.FetchRequest(config.RPC_URL);
    fetchReq.timeout = RPC_TIMEOUT_MS;
    
    this.provider = new ethers.JsonRpcProvider(fetchReq, config.CHAIN_ID, {
      staticNetwork: true  // 避免频繁查询网络信息
    });
    
    this.contractAddress = config.VOTING_CONTRACT;
    if (config.SIGNER_PRIVATE_KEY) {
      this.wallet = new ethers.Wallet(config.SIGNER_PRIVATE_KEY, this.provider);
    }
    this.iface = new ethers.Interface(VOTING_ABI);
  }

  /**
   * 包装超时控制的 Promise
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${operation} timeout after ${timeoutMs}ms`)),
          timeoutMs
        )
      )
    ]);
  }

  getProvider() {
    return this.provider;
  }

  getInterface() {
    return this.iface;
  }

  getReadContract() {
    return new ethers.Contract(this.contractAddress, VOTING_ABI, this.provider);
  }

  async getWriteContract() {
    const signer = this.wallet ?? (await this.provider.getSigner(0));
    return new ethers.Contract(this.contractAddress, VOTING_ABI, signer);
  }

  async createDispute(platformDisputeId: string) {
    const hash = ethers.keccak256(ethers.toUtf8Bytes(platformDisputeId));
    const contract = await this.getWriteContract();
    
    this.logger.debug(`Creating dispute for ${platformDisputeId}`);
    
    // 发送交易（带超时）
    const tx = await this.withTimeout(
      contract.createDispute(hash),
      TX_SEND_TIMEOUT_MS,
      'Send createDispute transaction'
    );
    
    this.logger.debug(`Transaction sent: ${tx.hash}, waiting for confirmation...`);
    
    // 等待交易确认（1 个确认，60 秒超时）
    const receipt = await this.withTimeout(
      tx.wait(1),
      TX_WAIT_TIMEOUT_MS,
      'Wait for createDispute confirmation'
    ) as ethers.TransactionReceipt | null;

    if (!receipt) {
      throw new Error('Transaction receipt is null');
    }

    let disputeId: bigint | null = null;
    let deadline: bigint | null = null;

    for (const log of receipt.logs ?? []) {
      try {
        const parsed = this.iface.parseLog(log);
        if (parsed?.name === "DisputeCreated") {
          disputeId = parsed.args.disputeId as bigint;
          deadline = parsed.args.deadline as bigint;
          break;
        }
      } catch {
        continue;
      }
    }

    if (disputeId === null || deadline === null) {
      throw new Error("DisputeCreated event not found in transaction receipt");
    }

    this.logger.log(`Dispute created: disputeId=${disputeId}, deadline=${deadline}`);
    return { disputeId, deadline };
  }

  async finalizeDispute(disputeId: bigint) {
    const contract = await this.getWriteContract();
    
    this.logger.debug(`Finalizing dispute ${disputeId}`);
    
    const tx = await this.withTimeout(
      contract.finalize(disputeId),
      TX_SEND_TIMEOUT_MS,
      'Send finalize transaction'
    );
    
    this.logger.debug(`Finalize tx sent: ${tx.hash}`);
    return tx;
  }

  async forceFinalizeDispute(disputeId: bigint) {
    const contract = await this.getWriteContract();
    
    this.logger.debug(`Force finalizing dispute ${disputeId}`);
    
    const tx = await this.withTimeout(
      contract.forceFinalize(disputeId),
      TX_SEND_TIMEOUT_MS,
      'Send forceFinalize transaction'
    );
    
    this.logger.debug(`Force finalize tx sent: ${tx.hash}`);
    return tx;
  }

  async voteOnBehalf(disputeId: bigint, voter: string, choice: number) {
    const contract = await this.getWriteContract();
    
    this.logger.debug(`Voting on behalf of ${voter} for dispute ${disputeId}`);
    
    const tx = await this.withTimeout(
      contract.voteOnBehalf(disputeId, voter, choice),
      TX_SEND_TIMEOUT_MS,
      'Send voteOnBehalf transaction'
    );
    
    this.logger.debug(`Vote tx sent: ${tx.hash}`);
    return tx;
  }

  async getTokenBalance(tokenAddress: string, address: string): Promise<bigint> {
    const tokenAbi = ["function balanceOf(address) view returns (uint256)"];
    const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, this.provider);
    
    return await this.withTimeout(
      tokenContract.balanceOf(address),
      RPC_TIMEOUT_MS,
      'Get token balance'
    );
  }
  
  /**
   * 等待交易确认（带超时）
   * 供外部调用，统一超时处理
   */
  async waitForTransaction(
    tx: ethers.TransactionResponse, 
    confirmations = 1
  ): Promise<ethers.TransactionReceipt> {
    const receipt = await this.withTimeout(
      tx.wait(confirmations),
      TX_WAIT_TIMEOUT_MS,
      `Wait for transaction ${tx.hash}`
    );
    
    if (!receipt) {
      throw new Error(`Transaction ${tx.hash} receipt is null`);
    }
    
    return receipt as ethers.TransactionReceipt;
  }
}
