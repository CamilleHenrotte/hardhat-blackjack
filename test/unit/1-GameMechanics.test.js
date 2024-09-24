const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")
const { solidity } = require("ethereum-waffle")
const { assert, expect } = require("chai")
const chai = require("chai")
const { CardValue, CardSuit } = require("../../utils/testEnum")

chai.use(solidity)

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("1- Game Mechanics", async () => {
          let blackjack, deployer
          beforeEach(async () => {
              deployer = (await getNamedAccounts()).deployer
              player = (await getNamedAccounts()).player
              await deployments.fixture(["all"])
              blackjack = await ethers.getContract("BlackjackTest", deployer)
          })

          describe("getCardPoints", () => {
              it("should compute the card points of an Ace correctly", async () => {
                  const pointsForAce = await blackjack.testGetCardPoints({ value: CardValue.Ace, suit: CardSuit.club })
                  expect(pointsForAce).to.equal(1)
              })
              it("should compute the card points of a four correctly", async () => {
                  const pointsForFour = await blackjack.testGetCardPoints({
                      value: CardValue.Four,
                      suit: CardSuit.club,
                  })
                  expect(pointsForFour).to.equal(4)
              })
              it("should compute the card points of a jack correctly", async () => {
                  const pointsForJack = await blackjack.testGetCardPoints({
                      value: CardValue.Jack,
                      suit: CardSuit.club,
                  })
                  expect(pointsForJack).to.equal(10)
              })
              it("should compute the card points of a king correctly", async () => {
                  const pointsForKing = await blackjack.testGetCardPoints({
                      value: CardValue.King,
                      suit: CardSuit.club,
                  })
                  expect(pointsForKing).to.equal(10)
              })
          })

          describe("initDeck", () => {
              it("should initialize a deck of cards sorted", async () => {
                  await blackjack.testInitDeck(player)
                  const deck = await blackjack.getDeck(player)
                  expect(deck.length).to.equal(52)
                  expect(deck[0].value).to.equal(0)
                  expect(deck[0].suit).to.equal(0)
              })
          })
          describe("shuffleDeck", () => {
              it("should shuffle the deck ", async () => {
                  await blackjack.testInitDeck(player)
                  const deckBeforeShuffle = await blackjack.getDeck(player)
                  await blackjack.testShuffleDeck(player, 0)
                  const deckAfterShuffle = await blackjack.getDeck(player)
                  expect(deckAfterShuffle.length).to.equal(52)
                  expect(deckBeforeShuffle[0]).to.not.equal(deckAfterShuffle[0])
                  expect(deckBeforeShuffle[1]).to.not.equal(deckAfterShuffle[1])
              })
          })
          describe("drawACard", () => {
              it("should remove the decrease the deck size of one", async () => {
                  await blackjack.testInitDeck(player)
                  const deckBeforeCardDrawn = await blackjack.getDeck(player)
                  await blackjack.testDrawACard(player)
                  const deckAfterCardDrawn = await blackjack.getDeck(player)
                  expect(deckBeforeCardDrawn.length).to.equal(52)
                  expect(deckAfterCardDrawn.length).to.equal(51)
              })
              it("should return the last element of the deck", async () => {
                  await blackjack.testInitDeck(player)
                  const cardDrawn = await blackjack.callStatic.testDrawACard(player)
                  expect(cardDrawn.value).to.equal(12)
                  expect(cardDrawn.suit).to.equal(3)
              })
          })
          describe("finishGameIfScoreIsAbove21", () => {
              it("player should loose the game if their score is above 21", async () => {
                  await blackjack.setPlayerHand(player, [
                      {
                          value: CardValue.King,
                          suit: CardSuit.club,
                      },
                      {
                          value: CardValue.Queen,
                          suit: CardSuit.club,
                      },
                      {
                          value: CardValue.Ten,
                          suit: CardSuit.club,
                      },
                  ])
                  const tx = await blackjack.testFinishGameIfScoreIsAbove21(player)
                  await expect(tx).to.emit(blackjack, "GameLost").withArgs(player, [], 0)
                  const isStarted = await blackjack.getGameStatus(player)
                  expect(isStarted).to.equal(false)
              })
              it("should be a tie game if both both player and dealer have both 21 points", async () => {
                  const handOf21Points = [
                      {
                          value: CardValue.King,
                          suit: CardSuit.club,
                      },
                      {
                          value: CardValue.Ace,
                          suit: CardSuit.club,
                      },
                  ]
                  await blackjack.setPlayerHand(player, handOf21Points)
                  await blackjack.setDealerHand(player, handOf21Points)
                  const tx = await blackjack.testFinishGameIfScoreIsAbove21(player)
                  await expect(tx).to.emit(blackjack, "GameTie")
                  const isStarted = await blackjack.getGameStatus(player)
                  expect(isStarted).to.equal(false)
              })
              it("player should win if he has 21 points and not the dealer", async () => {
                  const handOf21Points = [
                      {
                          value: CardValue.King,
                          suit: CardSuit.club,
                      },
                      {
                          value: CardValue.Ace,
                          suit: CardSuit.club,
                      },
                  ]
                  await blackjack.setPlayerHand(player, handOf21Points)
                  await blackjack.setDealerHand(player, [
                      {
                          value: CardValue.King,
                          suit: CardSuit.club,
                      },
                  ])
                  const tx = await blackjack.testFinishGameIfScoreIsAbove21(player)
                  await expect(tx).to.emit(blackjack, "GameWon")
                  const isStarted = await blackjack.getGameStatus(player)
                  expect(isStarted).to.equal(false)
              })
          })
          describe("removeFirstAce", async () => {
              it("should remove the first ace of an array of cards containing one ace", async () => {
                  const cards = [
                      {
                          value: CardValue.King,
                          suit: CardSuit.diamond,
                      },
                      {
                          value: CardValue.Ace,
                          suit: CardSuit.club,
                      },
                      {
                          value: CardValue.Three,
                          suit: CardSuit.club,
                      },
                  ]
                  const [aceRemoved, updatedCards] = await blackjack.testRemoveFirstAce(cards)
                  expect(aceRemoved).to.equal(true)
                  expect(updatedCards.length).to.equal(2)
                  expect(updatedCards[0].value).to.equal(CardValue.King)
                  expect(updatedCards[0].suit).to.equal(CardSuit.diamond)
                  expect(updatedCards[1].value).to.equal(CardValue.Three)
                  expect(updatedCards[1].suit).to.equal(CardSuit.club)
              })
              it("should remove the first ace of an array of cards containing two aces", async () => {
                  const cards = [
                      {
                          value: CardValue.King,
                          suit: CardSuit.diamond,
                      },
                      {
                          value: CardValue.Ace,
                          suit: CardSuit.club,
                      },
                      {
                          value: CardValue.Ace,
                          suit: CardSuit.diamond,
                      },
                  ]
                  const [aceRemoved, updatedCards] = await blackjack.testRemoveFirstAce(cards)
                  expect(aceRemoved).to.equal(true)
                  expect(updatedCards.length).to.equal(2)
                  expect(updatedCards[0].value).to.equal(CardValue.King)
                  expect(updatedCards[0].suit).to.equal(CardSuit.diamond)
                  expect(updatedCards[1].value).to.equal(CardValue.Ace)
                  expect(updatedCards[1].suit).to.equal(CardSuit.diamond)
              })
              it("array should remain unchanged if there is no ace", async () => {
                  const cards = [
                      {
                          value: CardValue.King,
                          suit: CardSuit.diamond,
                      },
                      {
                          value: CardValue.Two,
                          suit: CardSuit.club,
                      },
                  ]
                  const [aceRemoved, updatedCards] = await blackjack.testRemoveFirstAce(cards)
                  expect(aceRemoved).to.equal(false)
                  expect(updatedCards.length).to.equal(2)
              })
          })
          describe("computeScore", async () => {
              it("should add up the scores of all cards in the array", async () => {
                  const cardOne = {
                      value: CardValue.Jack,
                      suit: CardSuit.diamond,
                  }
                  const cardTwo = {
                      value: CardValue.Two,
                      suit: CardSuit.diamond,
                  }
                  const scoreCards = await blackjack.testComputeScore([cardOne, cardTwo])
                  const scoreCardOne = await blackjack.testGetCardPoints(cardOne)
                  const scoreCardTwo = await blackjack.testGetCardPoints(cardTwo)
                  expect(scoreCards).to.equal(scoreCardOne + scoreCardTwo)
              })
          })
          describe("computeHighestValidScore", async () => {
              it("if the cards don't have Ace the highestValidScore is the normal score", async () => {
                  const cards = [
                      {
                          value: CardValue.Eight,
                          suit: CardSuit.diamond,
                      },
                      {
                          value: CardValue.Two,
                          suit: CardSuit.club,
                      },
                      {
                          value: CardValue.Jack,
                          suit: CardSuit.club,
                      },
                  ]
                  const higeshtValidScore = await blackjack.testComputeHighestValidScore(cards)
                  const score = await blackjack.testComputeScore(cards)
                  expect(higeshtValidScore).to.equal(score)
                  expect(higeshtValidScore).to.equal(20)
              })
              it("if the cards have an Ace, the ace should count as 1 point if otherwise (if it counts as 11 points) the score is higher than 21", async () => {
                  const cards = [
                      {
                          value: CardValue.Ace,
                          suit: CardSuit.diamond,
                      },
                      {
                          value: CardValue.Ace,
                          suit: CardSuit.club,
                      },
                      {
                          value: CardValue.Jack,
                          suit: CardSuit.club,
                      },
                  ]
                  const higeshtValidScore = await blackjack.testComputeHighestValidScore(cards)
                  expect(higeshtValidScore).to.equal(12)
              })
              it("if the cards have an Ace, the ace should count as 11 points if otherwise (if it counts as 1 points) the score is below or equal to 21", async () => {
                  const cards = [
                      {
                          value: CardValue.Ace,
                          suit: CardSuit.diamond,
                      },
                      {
                          value: CardValue.Jack,
                          suit: CardSuit.club,
                      },
                  ]
                  const higeshtValidScore = await blackjack.testComputeHighestValidScore(cards)
                  expect(higeshtValidScore).to.equal(21)
              })
          })
          describe("dealerPlays", async () => {
              it("the dealer does not draw a card if its hand is above 17", async () => {
                  await blackjack.testInitDeck(player)
                  await blackjack.setDealerHand(player, [
                      {
                          value: CardValue.Eight,
                          suit: CardSuit.diamond,
                      },
                      {
                          value: CardValue.Jack,
                          suit: CardSuit.club,
                      },
                  ])
                  const dealerHandBeforePlaying = await blackjack.getDealerHand(player)
                  await blackjack.testDealerPlays(player)
                  const dealerHandAfterPlaying = await blackjack.getDealerHand(player)
                  expect(dealerHandBeforePlaying).to.eql(dealerHandAfterPlaying)
              })
              it("the dealer continues to draw a card until score is above 17", async () => {
                  await blackjack.testInitDeck(player)
                  await blackjack.testShuffleDeck(player, 0)
                  await blackjack.setDealerHand(player, [
                      {
                          value: CardValue.Two,
                          suit: CardSuit.diamond,
                      },
                  ])
                  const dealerHandBeforePlaying = await blackjack.getDealerHand(player)
                  await blackjack.testDealerPlays(player)
                  const dealerHandAfterPlaying = await blackjack.getDealerHand(player)
                  expect(dealerHandAfterPlaying.length).to.be.greaterThan(dealerHandBeforePlaying.length)
              })
          })
      })
