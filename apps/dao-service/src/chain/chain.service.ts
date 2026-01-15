import { Injectable } from "@nestjs/common";
import { ethers } from "ethers";
import { ConfigService } from "../config/config.service";

const VOTING_ABI = [
  "event DisputeCreated(uint256 indexed disputeId, bytes32 platformDisputeIdHash, uint256 deadline)",
  "event Voted(uint256 indexed disputeId, address indexed voter, uint8 choice)",
  "event DisputeFinalized(uint256 indexed disputeId, uint8 result, uint256 votesAgent, uint256 votesUser)",
  "function createDispute(bytes32 platformDisputeIdHash) returns (uint256)",
  "function finalize(uint256 disputeId)",
  "function forceFinalize(uint256 disputeId)"
];

@Injectable()
export class ChainService {
  private readonly provider: ethers.JsonRpcProvider;
  private readonly contractAddress: string;
  private readonly wallet?: ethers.Wallet;
  private readonly iface: ethers.Interface;

  constructor(private readonly configService: ConfigService) {
    const config = this.configService.get();
    this.provider = new ethers.JsonRpcProvider(config.RPC_URL);
    this.contractAddress = config.VOTING_CONTRACT;
    if (config.SIGNER_PRIVATE_KEY) {
      this.wallet = new ethers.Wallet(config.SIGNER_PRIVATE_KEY, this.provider);
    }
    this.iface = new ethers.Interface(VOTING_ABI);
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
    const tx = await contract.createDispute(hash);
    const receipt = await tx.wait();

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
      throw new Error("DisputeCreated event not found");
    }

    return { disputeId, deadline };
  }

  async finalizeDispute(disputeId: bigint) {
    const contract = await this.getWriteContract();
    return contract.finalize(disputeId);
  }

  async forceFinalizeDispute(disputeId: bigint) {
    const contract = await this.getWriteContract();
    return contract.forceFinalize(disputeId);
  }
}
