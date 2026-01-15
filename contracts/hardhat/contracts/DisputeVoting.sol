// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Balance {
    function balanceOf(address account) external view returns (uint256);
}

contract DisputeVoting {
    enum Result {
        NONE,
        SUPPORT_AGENT,
        SUPPORT_USER
    }

    struct Dispute {
        bytes32 platformDisputeIdHash;
        uint256 deadline;
        uint256 votesAgent;
        uint256 votesUser;
        bool finalized;
        Result result;
    }

    IERC20Balance public immutable token;
    uint256 public immutable minBalance;
    uint256 public immutable voteDurationSeconds;
    address public immutable admin;
    uint256 public nextDisputeId = 1;

    mapping(uint256 => Dispute) public disputes;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event DisputeCreated(uint256 indexed disputeId, bytes32 platformDisputeIdHash, uint256 deadline);
    event Voted(uint256 indexed disputeId, address indexed voter, uint8 choice);
    event DisputeFinalized(
        uint256 indexed disputeId,
        Result result,
        uint256 votesAgent,
        uint256 votesUser
    );

    constructor(address tokenAddress, uint256 minBalance_, uint256 voteDurationSeconds_) {
        require(tokenAddress != address(0), "TOKEN_ADDR");
        token = IERC20Balance(tokenAddress);
        minBalance = minBalance_;
        voteDurationSeconds = voteDurationSeconds_;
        admin = msg.sender;
    }

    function createDispute(bytes32 platformDisputeIdHash) external returns (uint256 disputeId) {
        disputeId = nextDisputeId++;
        uint256 deadline = block.timestamp + voteDurationSeconds;
        disputes[disputeId] = Dispute({
            platformDisputeIdHash: platformDisputeIdHash,
            deadline: deadline,
            votesAgent: 0,
            votesUser: 0,
            finalized: false,
            result: Result.NONE
        });

        emit DisputeCreated(disputeId, platformDisputeIdHash, deadline);
    }

    function vote(uint256 disputeId, uint8 choice) external {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.deadline != 0, "NO_DISPUTE");
        require(!hasVoted[disputeId][msg.sender], "ALREADY_VOTED");
        require(token.balanceOf(msg.sender) >= minBalance, "INSUFFICIENT_BALANCE");
        require(choice == 1 || choice == 2, "BAD_CHOICE");

        hasVoted[disputeId][msg.sender] = true;
        if (choice == 1) {
            dispute.votesAgent += 1;
        } else {
            dispute.votesUser += 1;
        }

        emit Voted(disputeId, msg.sender, choice);
    }

    function finalize(uint256 disputeId) external {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.deadline != 0, "NO_DISPUTE");
        require(!dispute.finalized, "FINALIZED");
        require(block.timestamp >= dispute.deadline, "TOO_EARLY");

        _finalize(dispute);
        emit DisputeFinalized(disputeId, dispute.result, dispute.votesAgent, dispute.votesUser);
    }

    function forceFinalize(uint256 disputeId) external {
        require(msg.sender == admin, "ONLY_ADMIN");
        Dispute storage dispute = disputes[disputeId];
        require(dispute.deadline != 0, "NO_DISPUTE");
        require(!dispute.finalized, "FINALIZED");
        _finalize(dispute);
        emit DisputeFinalized(disputeId, dispute.result, dispute.votesAgent, dispute.votesUser);
    }

    function _finalize(Dispute storage dispute) private {
        dispute.finalized = true;
        if (dispute.votesAgent > dispute.votesUser) {
            dispute.result = Result.SUPPORT_AGENT;
        } else {
            dispute.result = Result.SUPPORT_USER;
        }
    }
}
