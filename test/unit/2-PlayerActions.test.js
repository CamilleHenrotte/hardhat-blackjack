const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")
const { solidity } = require("ethereum-waffle")
const { assert, expect } = require("chai")
const chai = require("chai")
const { CardValue, CardSuit } = require("../../utils/testEnum")
chai.use(solidity)

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("2- Player Actions", async () => {
          let blackjack, deployer, player, wager
          beforeEach(async () => {
              deployer = (await getNamedAccounts()).deployer
              player = (await getNamedAccounts()).player
              const playerSigner = await ethers.getSigner(player)
              await deployments.fixture(["all"])
              blackjackConnectedToDeployer = await ethers.getContract("BlackjackTest", deployer)
              blackjack = await blackjackConnectedToDeployer.connect(playerSigner)
              wager = ethers.utils.parseEther("0.1")
          })
          describe("hit", async () => {
              it("reverts if the game is not already started", async () => {
                  await expect(blackjack.hit()).to.be.revertedWith("Blackjack__GameMustBeStarted")
              })
              it("draws a card to player hand", async () => {
                  await blackjack.setGameStatus(player, true)
                  await blackjack.testInitDeck(player)
                  await blackjack.testShuffleDeck(player, 0)
                  const playerHandBeforeHit = await blackjack.getPlayerHand(player)
                  await expect(blackjack.hit()).to.emit(blackjack, "GameHit")
                  const playerHandAfterHit = await blackjack.getPlayerHand(player)
                  expect(playerHandBeforeHit.length + 1).to.equal(playerHandAfterHit.length)
              })
              it("draws a card to player hand and finish the game if the score is above 21", async () => {
                  await blackjack.setGameStatus(player, true)
                  await blackjack.setPlayerHand(player, [
                      {
                          value: CardValue.King,
                          suit: CardSuit.club,
                      },
                      {
                          value: CardValue.Queen,
                          suit: CardSuit.club,
                      },
                  ])
                  await blackjack.testInitDeck(player)
                  await blackjack.testShuffleDeck(player, 1)
                  await expect(blackjack.hit()).to.emit(blackjack, "GameLost")
              })
          })
          describe("stand", async () => {
              it("reverts if the game is not already started", async () => {
                  await expect(blackjack.stand()).to.be.revertedWith("Blackjack__GameMustBeStarted")
              })
              it("emits a GameTie if dealer's hand and player's hand has the same score", async () => {
                  await blackjack.setProceeds(player, wager)
                  await blackjack.setGameStatus(player, true)
                  const cards = [
                      {
                          value: CardValue.King,
                          suit: CardSuit.club,
                      },
                      {
                          value: CardValue.Queen,
                          suit: CardSuit.club,
                      },
                  ]
                  await blackjack.setPlayerHand(player, cards)
                  await blackjack.setDealerHand(player, cards)
                  await expect(blackjack.stand()).to.emit(blackjack, "GameTie")
                  const isStarted = await blackjack.getGameStatus(player)
                  await expect(isStarted).to.equal(false)
                  const proceedsAfterStanding = await blackjack.getProceeds(player)
                  await expect(proceedsAfterStanding).to.equal(wager)
              })
              it("emits GameLost if dealer's hand score superior to player's hand score", async () => {
                  await blackjack.setGameStatus(player, true)
                  await blackjack.setProceeds(player, wager)
                  const playerHand = [
                      {
                          value: CardValue.Ten,
                          suit: CardSuit.club,
                      },
                      {
                          value: CardValue.Eight,
                          suit: CardSuit.diamond,
                      },
                  ]
                  const dealerHand = [
                      {
                          value: CardValue.King,
                          suit: CardSuit.club,
                      },
                      {
                          value: CardValue.Queen,
                          suit: CardSuit.club,
                      },
                  ]

                  await blackjack.setPlayerHand(player, playerHand)
                  await blackjack.setDealerHand(player, dealerHand)
                  await expect(blackjack.stand()).to.emit(blackjack, "GameLost")
                  const isStarted = await blackjack.getGameStatus(player)
                  await expect(isStarted).to.equal(false)
                  const proceedsAfterStanding = await blackjack.getProceeds(player)
                  await expect(proceedsAfterStanding).to.equal(0)
              })
              it("emits GameWon if dealer's hand score superior to player's hand score", async () => {
                  await blackjack.setGameStatus(player, true)
                  await blackjack.setProceeds(player, wager)
                  const playerHand = [
                      {
                          value: CardValue.King,
                          suit: CardSuit.club,
                      },
                      {
                          value: CardValue.Queen,
                          suit: CardSuit.club,
                      },
                  ]
                  const dealerHand = [
                      {
                          value: CardValue.Ten,
                          suit: CardSuit.club,
                      },
                      {
                          value: CardValue.Eight,
                          suit: CardSuit.diamond,
                      },
                  ]

                  await blackjack.setPlayerHand(player, playerHand)
                  await blackjack.setDealerHand(player, dealerHand)
                  await expect(blackjack.stand()).to.emit(blackjack, "GameWon")
                  const isStarted = await blackjack.getGameStatus(player)
                  await expect(isStarted).to.equal(false)
                  const proceedsAfterStanding = await blackjack.getProceeds(player)
                  await expect(proceedsAfterStanding).to.equal(wager.mul(2))
              })
          })
          describe("doubleDown", async () => {
              it("reverts if the game is not already started", async () => {
                  await expect(blackjack.doubleDown({ value: wager })).to.be.revertedWith(
                      "Blackjack__GameMustBeStarted"
                  )
              })
              it("reverts if the player sends the wrong amount to double his wager", async () => {
                  await blackjack.setGameStatus(player, true)
                  await blackjack.setProceeds(player, wager)
                  await expect(blackjack.doubleDown({ value: wager.mul(2) })).to.be.revertedWith(
                      "Blackjack__WrongAmountToDoubleWager"
                  )
              })
              it("should emit GameDoubledDown", async () => {
                  await blackjack.setGameStatus(player, true)
                  await blackjack.setProceeds(player, wager)
                  await blackjack.testInitDeck(player)
                  await blackjack.testShuffleDeck(player, 1)
                  await expect(blackjack.doubleDown({ value: wager })).to.emit(blackjack, "GameDoubledDown")
              })
              it("should double down the wager and win 4*wager", async () => {
                  await blackjack.setGameStatus(player, true)
                  await blackjack.setProceeds(player, wager)
                  await blackjack.testInitDeck(player)
                  await blackjack.testShuffleDeck(player, 1)
                  await expect(blackjack.doubleDown({ value: wager })).to.emit(blackjack, "GameWon")
                  const proceedsAfterStanding = await blackjack.getProceeds(player)
                  await expect(proceedsAfterStanding).to.equal(wager.mul(4))
              })
          })
          describe("split", async () => {
              it("reverts if the game is not already started", async () => {
                  await expect(blackjack.split({ value: wager })).to.be.revertedWith("Blackjack__GameMustBeStarted")
              })
              it("reverts if the player sends the wrong amount to double his wager", async () => {
                  await blackjack.setGameStatus(player, true)
                  await blackjack.setProceeds(player, wager)
                  await expect(blackjack.split({ value: wager.mul(2) })).to.be.revertedWith(
                      "Blackjack__WrongAmountToDoubleWager"
                  )
              })
              it("reverts if the player hand is not a pair", async () => {
                  await blackjack.setGameStatus(player, true)
                  await blackjack.setProceeds(player, wager)
                  const playerHand = [
                      {
                          value: CardValue.King,
                          suit: CardSuit.club,
                      },
                      {
                          value: CardValue.Queen,
                          suit: CardSuit.club,
                      },
                  ]
                  await blackjack.setPlayerHand(player, playerHand)
                  await expect(blackjack.split({ value: wager })).to.be.revertedWith("Blackjack__PlayerHandMustBeAPair")
              })
              it("removes one card of the pair of the player hand and doubles the wager", async () => {
                  await blackjack.setGameStatus(player, true)
                  await blackjack.setProceeds(player, wager)
                  const playerHand = [
                      {
                          value: CardValue.Ten,
                          suit: CardSuit.club,
                      },
                      {
                          value: CardValue.Ten,
                          suit: CardSuit.diamond,
                      },
                  ]
                  await blackjack.setPlayerHand(player, playerHand)
                  await expect(blackjack.split({ value: wager })).to.emit(blackjack, "GameSplit")
                  const proceedsAfterSplit = await blackjack.getProceeds(player)
                  await expect(proceedsAfterSplit).to.equal(wager.mul(2))
                  const playerHandAfterSplit = await blackjack.getPlayerHand(player)
                  expect(playerHandAfterSplit.length).to.equal(1)
                  expect(playerHandAfterSplit[0].value).to.equal(CardValue.Ten)
              })
          })
          describe("surrender", async () => {
              it("reverts if the game is not already started", async () => {
                  await expect(blackjack.surrender()).to.be.revertedWith("Blackjack__GameMustBeStarted")
              })
              it("emits game Surrended and ends the game with half the wager for the player", async () => {
                  await blackjack.setGameStatus(player, true)
                  await blackjack.setProceeds(player, wager)
                  await expect(blackjack.surrender()).to.emit(blackjack, "GameSurrended")
                  const proceedsAfterSplit = await blackjack.getProceeds(player)
                  await expect(proceedsAfterSplit).to.equal(wager.div(2))
                  const isStarted = await blackjack.getGameStatus(player)
                  await expect(isStarted).to.equal(false)
              })
          })
      })
