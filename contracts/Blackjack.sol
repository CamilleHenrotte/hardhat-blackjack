// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
// Uncomment this line to use console.log
// import "hardhat/console.sol";

// ---------- Custom Errors ----------
error Blackjack__DealerHasNotEnoughCollateral(uint256 dealerBalance, uint256 playerBalance);
error Blackjack__GameNotFunded();
error Blackjack__GameMustNotBeStarted();
error Blackjack__GameMustBeStarted();
error Blackjack__WrongAmountToDoubleWager(address player, uint256 amountNeeded, uint256 amountReceived);
error Blackjack__PlayerHandMustBeAPair();
error Blackjack__OnlyOwner();

contract Blackjack is VRFConsumerBaseV2 {
    // ---------- Chainlink VRF variables ----------
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private immutable i_callbackGasLimit;

    // ---------- Players' states and proceeds ----------
    address[] private s_players; // addresses of the players having more than 0 in their proceeds
    mapping(address => uint256) internal s_proceeds;
    mapping(address => GameState) internal s_states;
    mapping(uint256 => address) private s_requestIdToPlayer;

    // ---------- Dealer's address ----------
    address payable public immutable i_dealer;

    // ---------- Card values and suits ----------
    enum CardValue {
        Ace,
        Two,
        Three,
        Four,
        Five,
        Six,
        Seven,
        Eight,
        Nine,
        Ten,
        Jack,
        Queen,
        King
    }
    enum CardSuit {
        club,
        diamond,
        heart,
        spade
    }
    struct Card {
        CardValue value;
        CardSuit suit;
    }

    // ---------- Game state for each player ----------
    struct GameState {
        Card[] dealerHand; //the first card is the hidden Card of the dealer
        Card[] playerHand;
        Card[] deck; //the deck is beeing dealt from the last card to the first one.
        bool isStarted;
    }

    // ---------- Events ----------
    event GameFunded(address indexed player, uint256 balance);
    event DealerFunded(address indexed player, uint256 balance);
    event GameStarted(address indexed player, Card visibleDealerCard, Card[] playerHand, uint256 balance);
    event GameLost(address indexed player, Card[] dealerHand, uint256 balance);
    event GameTie(address indexed player, Card[] dealerHand, uint256 balance);
    event GameWon(address indexed player, Card[] dealerHand, uint256 balance);
    event GameSurrended(address indexed player, Card[] dealerHand, uint256 balance);
    event GameHit(address indexed player, Card drawnCard, uint256 balance);
    event GameSplit(address indexed player, Card[] playerHand, uint256 balance);
    event GameDoubledDown(address indexed player, uint256 balance);
    event RequestedRandomWord(address indexed player, uint256 requestId);
    event PlayerWithdrawAllFunds(address indexed player);

    // ---------- Constructor ----------
    constructor(
        address vrfCoordinatorV2,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        i_dealer = payable(msg.sender);
    }

    // ---------- Modifiers ----------
    modifier NotEnoughCollateral() {
        uint256 availableCollateral = getAvailableProceeds();
        if (availableCollateral < msg.value * 2) {
            revert Blackjack__DealerHasNotEnoughCollateral(availableCollateral, msg.value);
        }
        _;
    }
    modifier GameNotFunded() {
        if (s_proceeds[msg.sender] <= 0) {
            revert Blackjack__GameNotFunded();
        }
        _;
    }
    modifier GameMustNotBeStarted() {
        if (s_states[msg.sender].isStarted) {
            revert Blackjack__GameMustNotBeStarted();
        }
        _;
    }
    modifier GameMustBeStarted() {
        if (!s_states[msg.sender].isStarted) {
            revert Blackjack__GameMustBeStarted();
        }
        _;
    }
    modifier WrongAmountToDoubleWager() {
        if (s_proceeds[payable(msg.sender)] != msg.value) {
            revert Blackjack__WrongAmountToDoubleWager(msg.sender, s_proceeds[payable(msg.sender)], msg.value);
        }
        _;
    }
    modifier PlayerHandMustBeAPair() {
        Card[] memory playerHand = s_states[msg.sender].playerHand;
        bool playerHandIsAPair = playerHand.length == 2 && playerHand[0].value == playerHand[1].value;
        if (!playerHandIsAPair) {
            revert Blackjack__PlayerHandMustBeAPair();
        }
        _;
    }
    modifier OnlyOwner() {
        if (msg.sender != i_dealer) {
            revert Blackjack__OnlyOwner();
        }

        _;
    }

    // ---------- 1. Game Mechanics ----------
    function getCardPoints(Card memory card) internal pure returns (uint8) {
        CardValue cardValue = card.value; // Access the value from the Card struct
        if (cardValue == CardValue.Ace) {
            return 1; // Ace can be 1 or 11, but we'll return 1 as the default
        } else if (cardValue == CardValue.Two) {
            return 2;
        } else if (cardValue == CardValue.Three) {
            return 3;
        } else if (cardValue == CardValue.Four) {
            return 4;
        } else if (cardValue == CardValue.Five) {
            return 5;
        } else if (cardValue == CardValue.Six) {
            return 6;
        } else if (cardValue == CardValue.Seven) {
            return 7;
        } else if (cardValue == CardValue.Eight) {
            return 8;
        } else if (cardValue == CardValue.Nine) {
            return 9;
        } else if (
            cardValue == CardValue.Ten ||
            cardValue == CardValue.Jack ||
            cardValue == CardValue.Queen ||
            cardValue == CardValue.King
        ) {
            return 10;
        }
        return 0;
    }
    function initDeck(Card[] storage deck) internal {
        for (uint8 s = 0; s < 4; s++) {
            for (uint8 v = 0; v < 13; v++) {
                deck.push(Card(CardValue(v), CardSuit(s)));
            }
        }
    }
    function shuffleDeck(uint256 randomWord, Card[] storage deck) internal {
        for (uint8 i = 51; i > 0; i--) {
            uint8 j = uint8(uint256(keccak256(abi.encode(randomWord, i))) % (i + 1));
            Card memory temp = deck[i];
            deck[i] = deck[j];
            deck[j] = temp;
        }
    }
    // Draw a card from the deck (removes the last element and returns it)
    function drawACard(Card[] storage deck) internal returns (Card memory) {
        require(deck.length > 0, "Deck is empty");
        Card memory drawnCard = deck[deck.length - 1];
        deck.pop();
        return drawnCard;
    }
    function finishGameIfScoreAbove21(GameState storage gameState, address player) internal {
        uint8 score = computeHighestValidScore(gameState.playerHand);
        if (score > 21) {
            s_proceeds[player] = 0;
            emit GameLost(player, gameState.dealerHand, s_proceeds[player]);
            delete s_states[player];
            removeElement(s_players, player);
        } else if (score == 21) {
            uint8 dealerScore = computeHighestValidScore(gameState.dealerHand);
            if (dealerScore == 21) {
                emit GameTie(player, gameState.dealerHand, s_proceeds[player]);
                delete s_states[player];
            } else {
                s_proceeds[player] += s_proceeds[player] / 2;
                emit GameWon(player, gameState.dealerHand, s_proceeds[player]);
                delete s_states[player];
            }
        }
    }
    function removeElement(address[] storage array, address value) internal {
        for (uint i = 0; i < array.length; i++) {
            if (array[i] == value) {
                array[i] = array[array.length - 1]; // Replace with the last element
                array.pop(); // Remove the last element
                break;
            }
        }
    }
    function removeFirstAce(Card[] memory cards) internal pure returns (bool, Card[] memory) {
        for (uint8 i = 0; i < cards.length; i++) {
            if (cards[i].value == CardValue.Ace) {
                // Remove the Ace by shifting elements to the left
                for (uint8 j = i; j < cards.length - 1; j++) {
                    cards[j] = cards[j + 1];
                }
                // Reduce the array length by 1
                assembly {
                    mstore(cards, sub(mload(cards), 1))
                }
                return (true, cards);
            }
        }
        return (false, cards); // No Ace found, return unchanged array
    }
    function computeScore(Card[] memory cards) internal pure returns (uint8) {
        uint8 score = 0;
        for (uint8 i = 0; i < cards.length; i++) {
            score = score + getCardPoints(cards[i]);
        }
        return score;
    }
    function computeHighestValidScore(Card[] memory cards) internal pure returns (uint8) {
        uint8 score;
        (bool hasAce, Card[] memory cardsWhithoutFirstAce) = removeFirstAce(cards);
        if (hasAce) {
            uint8 highScore = 11 + computeScore(cardsWhithoutFirstAce);
            if (highScore > 21) {
                uint8 lowScore = 1 + computeScore(cardsWhithoutFirstAce);
                score = lowScore;
            } else {
                score = highScore;
            }
        } else {
            score = computeScore(cards);
        }
        return score;
    }
    function dealerPlays(GameState storage gameState) internal {
        uint8 score = computeHighestValidScore(gameState.dealerHand);
        while (score < 17) {
            gameState.dealerHand.push(drawACard(gameState.deck));
            score = computeHighestValidScore(gameState.dealerHand);
        }
    }

    // ---------- 2. Player Actions ----------
    function hit() public GameMustBeStarted {
        address player = msg.sender;
        GameState storage gameState = s_states[player];
        Card memory card = drawACard(gameState.deck);
        gameState.playerHand.push(card);
        emit GameHit(player, card, s_proceeds[player]);
        finishGameIfScoreAbove21(gameState, player);
    }
    function stand() public GameMustBeStarted {
        GameState storage gameState = s_states[msg.sender];
        address player = msg.sender;
        uint8 playerScore = computeHighestValidScore(gameState.playerHand);
        uint8 dealerScore = computeHighestValidScore(gameState.dealerHand);
        dealerPlays(gameState);
        if (playerScore == dealerScore) {
            emit GameTie(player, gameState.dealerHand, s_proceeds[player]);
            delete s_states[player];
        } else if (playerScore < dealerScore) {
            s_proceeds[player] = 0;
            emit GameLost(player, gameState.dealerHand, s_proceeds[player]);
            delete s_states[player];
            removeElement(s_players, player);
        } else {
            s_proceeds[player] = s_proceeds[player] * 2;
            emit GameWon(player, gameState.dealerHand, s_proceeds[player]);
            delete s_states[player];
        }
    }
    function doubleDown() public payable GameMustBeStarted WrongAmountToDoubleWager {
        s_proceeds[msg.sender] += msg.value;
        emit GameDoubledDown(msg.sender, s_proceeds[msg.sender]);
        hit();
        stand();
    }
    function split() public payable GameMustBeStarted WrongAmountToDoubleWager PlayerHandMustBeAPair {
        s_proceeds[msg.sender] += msg.value;
        address player = msg.sender;
        GameState storage gameState = s_states[player];
        gameState.playerHand.pop();
        emit GameSplit(msg.sender, gameState.playerHand, s_proceeds[msg.sender]);
    }
    function surrender() public GameMustBeStarted {
        GameState storage gameState = s_states[msg.sender];
        s_proceeds[msg.sender] -= s_proceeds[msg.sender] / 2;
        delete s_states[msg.sender];
        emit GameSurrended(msg.sender, gameState.dealerHand, s_proceeds[msg.sender]);
    }

    // ---------- 3. Chainlink VRF and Game Start ----------
    function startAGame() public GameNotFunded GameMustNotBeStarted {
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane,
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            1
        );
        s_requestIdToPlayer[requestId] = msg.sender;
        emit RequestedRandomWord(msg.sender, requestId);
    }
    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        address player = s_requestIdToPlayer[requestId];
        GameState storage gameState = s_states[player];
        initDeck(gameState.deck);
        shuffleDeck(randomWords[0], gameState.deck);

        gameState.dealerHand.push(drawACard(gameState.deck));
        gameState.dealerHand.push(drawACard(gameState.deck));
        gameState.playerHand.push(drawACard(gameState.deck));
        gameState.playerHand.push(drawACard(gameState.deck));
        gameState.isStarted = true;
        emit GameStarted(player, gameState.dealerHand[1], gameState.playerHand, s_proceeds[player]);
        finishGameIfScoreAbove21(gameState, player);
        delete s_requestIdToPlayer[requestId];
    }

    // ---------- 4. Dealer Fund and Proceeds Management ----------
    receive() external payable {
        emit DealerFunded(msg.sender, viewBalanceOfOwner());
    }
    function getLockedProceeds() public view returns (uint256) {
        uint256 lockedProceeds = 0;
        for (uint256 i = 0; i < s_players.length; i += 1) {
            lockedProceeds += s_proceeds[s_players[i]];
        }
        return lockedProceeds;
    }
    function getAvailableProceeds() public view returns (uint256) {
        uint256 balance = viewBalanceOfOwner();
        uint256 lockedProceeds = getLockedProceeds() * 2;
        if (lockedProceeds > balance) {
            return 0;
        }
        return balance - lockedProceeds;
    }
    function withdrawMoneyToOwner(uint256 amount) external OnlyOwner {
        uint256 maximumAmount = getAvailableProceeds();
        if (amount > maximumAmount) {
            amount = maximumAmount;
        }
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed.");
    }

    function fundAGame() external payable NotEnoughCollateral GameMustNotBeStarted {
        bool isPlayerInArray = false;
        for (uint256 i = 0; i < s_players.length; i++) {
            if (s_players[i] == msg.sender) {
                isPlayerInArray = true;
                break;
            }
        }
        if (!isPlayerInArray) {
            s_players.push(msg.sender);
        }
        s_proceeds[payable(msg.sender)] += msg.value;
        emit GameFunded(msg.sender, s_proceeds[payable(msg.sender)]);
    }

    function viewBalanceOfOwner() public view returns (uint256) {
        return address(this).balance;
    }
    function getProceeds(address player) public view returns (uint256) {
        return s_proceeds[player];
    }
    function withdrawMoneyToPlayer() public GameMustNotBeStarted {
        removeElement(s_players, msg.sender);
        (bool success, ) = payable(msg.sender).call{value: s_proceeds[msg.sender]}("");
        require(success, "Transfer failed.");
        delete s_proceeds[msg.sender];
        emit PlayerWithdrawAllFunds(msg.sender);
    }

    // ---------- 5. View game state functions ----------
    function getPlayerHand(address player) public view returns (Card[] memory) {
        return s_states[player].playerHand;
    }
    function getVisibleDealerHand(address player) public view returns (Card[] memory) {
        Card[] memory fullHand = s_states[player].dealerHand;
        uint256 startIndex = 1;
        require(startIndex < fullHand.length, "Start index out of bounds");
        uint256 newLength = fullHand.length - startIndex;
        Card[] memory visibleHand = new Card[](newLength);
        for (uint256 i = 0; i < newLength; i++) {
            visibleHand[i] = fullHand[startIndex + i];
        }
        return visibleHand;
    }
    function getGameStatus(address player) public view returns (bool) {
        return s_states[player].isStarted;
    }
    function getPlayers() public view returns (address[] memory) {
        return s_players;
    }
    function convertHandToTuples(Card[] memory hand) internal pure returns (uint256[] memory) {
        uint256[] memory handAsTuples = new uint256[](hand.length * 2);
        for (uint256 i = 0; i < hand.length; i++) {
            handAsTuples[i * 2] = uint256(hand[i].value);
            handAsTuples[i * 2 + 1] = uint256(hand[i].suit);
        }
        return handAsTuples;
    }
}
