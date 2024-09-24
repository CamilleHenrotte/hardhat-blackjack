const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")
const { solidity } = require("ethereum-waffle")
const { assert, expect } = require("chai")
const chai = require("chai")

chai.use(solidity)

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Staging test", async () => {
          let deployer,
              deployerSigner,
              player,
              player2,
              player3,
              wager,
              blackjack,
              blackjackConnectedToPlayer1,
              blackjackConnectedToPlayer2,
              blackjackConnectedToPlayer3,
              initialBalanceOfBlackjack,
              vrfCoordinatorV2Mock
          beforeEach(async () => {
              deployer = (await getNamedAccounts()).deployer
              player = (await getNamedAccounts()).player
              player2 = (await getNamedAccounts()).player2
              player3 = (await getNamedAccounts()).player3
              deployerSigner = await ethers.getSigner(player)
              const playerSigner = await ethers.getSigner(player)
              const playerSigner2 = await ethers.getSigner(player2)
              const playerSigner3 = await ethers.getSigner(player3)
              await deployments.fixture(["all"])
              blackjack = await ethers.getContract("BlackjackTest", deployer)
              blackjackConnectedToPlayer1 = await blackjack.connect(playerSigner)
              blackjackConnectedToPlayer2 = await blackjack.connect(playerSigner2)
              blackjackConnectedToPlayer3 = await blackjack.connect(playerSigner3)
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              wager = ethers.utils.parseEther("0.1")

              await deployerSigner.sendTransaction({
                  to: blackjack.address,
                  value: wager.mul(8),
              })
              initialBalanceOfBlackjack = await blackjack.viewBalanceOfOwner()
          })

          async function startTheGame() {
              await blackjackConnectedToPlayer1.fundAGame({ value: wager })
              await blackjackConnectedToPlayer2.fundAGame({ value: wager })
              await blackjackConnectedToPlayer3.fundAGame({ value: wager })
              const txResponse1 = await blackjackConnectedToPlayer1.startAGame()
              const txResponse2 = await blackjackConnectedToPlayer2.startAGame()
              const txResponse3 = await blackjackConnectedToPlayer3.startAGame()
              const txReceipt1 = await txResponse1.wait(1)
              const txReceipt2 = await txResponse2.wait(1)
              const txReceipt3 = await txResponse3.wait(1)
              const requestId1 = txReceipt1.events.find((event) => event.event === "RequestedRandomWord").args.requestId
              const requestId2 = txReceipt2.events.find((event) => event.event === "RequestedRandomWord").args.requestId
              const requestId3 = txReceipt3.events.find((event) => event.event === "RequestedRandomWord").args.requestId
              await vrfCoordinatorV2Mock.fulfillRandomWords(requestId1, blackjack.address)
              await vrfCoordinatorV2Mock.fulfillRandomWords(requestId2, blackjack.address)
              await vrfCoordinatorV2Mock.fulfillRandomWords(requestId3, blackjack.address)
          }
          describe("one player hit and stand, one player doubles down, the last one surrenders, then they all withdraw their money", () => {
              it("all three players start a game", async () => {
                  await startTheGame()
                  const players = await blackjack.getPlayers()
                  expect(players.length).to.equal(3)
                  expect(players).to.include(player)
                  expect(players).to.include(player2)
                  expect(players).to.include(player3)
                  const BalanceOfBlackjackAfterFunding = await blackjack.viewBalanceOfOwner()
                  expect(BalanceOfBlackjackAfterFunding.sub(initialBalanceOfBlackjack)).to.equal(wager.mul(3))
              })
              it("first player hits and looses", async () => {
                  await startTheGame()
                  const playerHandBeforeHit = await blackjack.getPlayerHand(player)
                  expect(playerHandBeforeHit.length).to.equal(2)
                  const txResponse = await blackjackConnectedToPlayer1.hit()
                  const txReceipt = await txResponse.wait(1)
                  await expect(txResponse).to.emit(blackjack, "GameLost")
                  const drawnCard = txReceipt.events.find((event) => event.event === "GameHit").args.drawnCard
                  const playerHandAfterHit = [...playerHandBeforeHit, drawnCard]
                  const higestValidScore = await blackjack.testComputeHighestValidScore(playerHandAfterHit)
                  expect(higestValidScore).to.be.greaterThan(21)
                  const playerHandAfterLoosing = await blackjack.getPlayerHand(player)
                  expect(playerHandAfterLoosing.length).to.equal(0)
                  const players = await blackjack.getPlayers()
                  expect(players.length).to.equal(2)
                  expect(players).not.to.include(player)
                  const proceeds = await blackjack.getProceeds(player)
                  expect(proceeds).to.equal(0)
              })
              it("second player hits and doubles down and looses", async () => {
                  await startTheGame()
                  await blackjackConnectedToPlayer1.hit()
                  await blackjackConnectedToPlayer2.hit()
                  const playerHandBeforeDoubleDown = await blackjack.getPlayerHand(player2)
                  const txResponse = await blackjackConnectedToPlayer2.doubleDown({ value: wager })
                  const txReceipt = await txResponse.wait(1)
                  await expect(txResponse).to.emit(blackjack, "GameLost")
                  const drawnCard = txReceipt.events.find((event) => event.event === "GameHit").args.drawnCard
                  const dealerHand = txReceipt.events.find((event) => event.event === "GameLost").args.dealerHand
                  const playerHandAfterDoubleDown = [...playerHandBeforeDoubleDown, drawnCard]
                  const playerHigestValidScore = await blackjack.testComputeHighestValidScore(playerHandAfterDoubleDown)
                  const dealerHigestValidScore = await blackjack.testComputeHighestValidScore(dealerHand)
                  expect(dealerHigestValidScore).to.be.greaterThan(playerHigestValidScore)
                  const playerHandAfterLoosing = await blackjack.getPlayerHand(player2)
                  expect(playerHandAfterLoosing.length).to.equal(0)
                  const players = await blackjack.getPlayers()
                  expect(players.length).to.equal(1)
                  expect(players).not.to.include(player)
                  const proceeds = await blackjack.getProceeds(player2)
                  expect(proceeds).to.equal(0)
              })
              it("third player surrenders", async () => {
                  await startTheGame()
                  await blackjackConnectedToPlayer1.hit()
                  await blackjackConnectedToPlayer2.hit()
                  await blackjackConnectedToPlayer2.doubleDown({ value: wager })
                  const txResponse = await blackjackConnectedToPlayer3.surrender()
                  await expect(txResponse).to.emit(blackjack, "GameSurrended")
                  const playerHandAfterLoosing = await blackjack.getPlayerHand(player3)
                  expect(playerHandAfterLoosing.length).to.equal(0)
                  const players = await blackjack.getPlayers()
                  expect(players.length).to.equal(1)
                  expect(players).to.include(player3)
                  const proceeds = await blackjack.getProceeds(player3)
                  expect(proceeds).to.equal(wager.div(2))
              })
              it("dealer withdraws available proceeds", async () => {
                  await startTheGame()
                  await blackjackConnectedToPlayer1.hit()
                  await blackjackConnectedToPlayer2.hit()
                  await blackjackConnectedToPlayer2.doubleDown({ value: wager })
                  await blackjackConnectedToPlayer3.surrender()
                  await blackjack.withdrawMoneyToOwner(wager.mul(11))
                  const availableProceeds = await blackjack.getAvailableProceeds()
                  const finalBalanceOfBlackjack = await blackjack.viewBalanceOfOwner()
                  expect(availableProceeds).to.equal(0)
                  expect(finalBalanceOfBlackjack).to.equal(wager)
              })
          })
      })
