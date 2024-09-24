// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../Blackjack.sol";

contract BlackjackTest is Blackjack {
    constructor(
        address vrfCoordinatorV2,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit
    ) Blackjack(vrfCoordinatorV2, gasLane, subscriptionId, callbackGasLimit) {}
    function testGetCardPoints(Card memory card) public pure returns (uint8) {
        return super.getCardPoints(card);
    }
    function testInitDeck(address player) public {
        GameState storage gameState = s_states[player];
        super.initDeck(gameState.deck);
    }

    function setPlayerHand(address player, Card[] memory playerHand) public {
        for (uint i = 0; i < playerHand.length; i++) {
            s_states[player].playerHand.push(playerHand[i]);
        }
    }
    function setDealerHand(address player, Card[] memory dealerHand) public {
        for (uint i = 0; i < dealerHand.length; i++) {
            s_states[player].dealerHand.push(dealerHand[i]);
        }
    }
    function setProceeds(address player, uint256 proceeds) public {
        s_proceeds[player] = proceeds;
    }
    function setGameStatus(address player, bool isStarted) public {
        s_states[player].isStarted = isStarted;
    }
    function getDeck(address player) public view returns (Card[] memory) {
        return s_states[player].deck;
    }
    function getDealerHand(address player) public view returns (Card[] memory) {
        return s_states[player].dealerHand;
    }

    function testShuffleDeck(address player, uint256 randomWord) public {
        super.shuffleDeck(randomWord, s_states[player].deck);
    }
    function testDrawACard(address player) public returns (Card memory) {
        return super.drawACard(s_states[player].deck);
    }
    function testFinishGameIfScoreIsAbove21(address player) public {
        super.finishGameIfScoreAbove21(s_states[player], player);
    }
    function testRemoveFirstAce(Card[] memory cards) public pure returns (bool, Card[] memory) {
        return super.removeFirstAce(cards);
    }
    function testComputeScore(Card[] memory cards) public pure returns (uint8) {
        return super.computeScore(cards);
    }
    function testComputeHighestValidScore(Card[] memory cards) public pure returns (uint8) {
        return super.computeHighestValidScore(cards);
    }
    function testDealerPlays(address player) public {
        super.dealerPlays(s_states[player]);
    }
}
