const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")
const { solidity } = require("ethereum-waffle")
const { assert, expect } = require("chai")
const chai = require("chai")

chai.use(solidity)

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("3- Chainlink VRF and Game Start", async () => {
          let blackjack, vrfCoordinatorV2Mock, deployer, player, wager
          beforeEach(async () => {
              deployer = (await getNamedAccounts()).deployer
              player = (await getNamedAccounts()).player
              const playerSigner = await ethers.getSigner(player)
              await deployments.fixture(["all"])
              blackjackConnectedToDeployer = await ethers.getContract("BlackjackTest", deployer)
              blackjack = await blackjackConnectedToDeployer.connect(playerSigner)
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              wager = ethers.utils.parseEther("0.1")
          })
          describe("startAGame", async () => {
              it("should revert if the game is not funded", async () => {
                  await expect(blackjack.startAGame()).to.be.revertedWith("Blackjack__GameNotFunded")
              })
              it("should revert if the game is already started", async () => {
                  await blackjack.setProceeds(player, wager)
                  await blackjack.setGameStatus(player, true)
                  await expect(blackjack.startAGame()).to.be.revertedWith("Blackjack__GameMustNotBeStarted")
              })
              it("calls the vrf coordinator", async () => {
                  await blackjack.setProceeds(player, wager)
                  const txResponse = await blackjack.startAGame()
                  const txReceipt = await txResponse.wait(1)
                  const requestId = txReceipt.events[1].args.requestId
                  assert(requestId.toNumber() > 0)
              })
          })
          describe("fulfillRandomWords", async () => {
              it("can only be called after startAGame", async () => {
                  await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, blackjack.address)).to.be.revertedWith(
                      "nonexistent request"
                  )
              })
              it("initializes the game state", async () => {
                  await blackjack.setProceeds(player, wager)
                  const txResponse = await blackjack.startAGame()
                  const txReceipt = await txResponse.wait(1)

                  const requestId = txReceipt.events.find((event) => event.event === "RequestedRandomWord").args
                      .requestId

                  await vrfCoordinatorV2Mock.fulfillRandomWords(requestId, blackjack.address)

                  const dealerHand = await blackjack.getDealerHand(player)
                  const playerHand = await blackjack.getPlayerHand(player)
                  const isStarted = await blackjack.getGameStatus(player)
                  const deck = await blackjack.getDeck(player)

                  expect(dealerHand.length).to.equal(2)
                  expect(playerHand.length).to.equal(2)
                  expect(isStarted).to.equal(true)
                  expect(deck.length).to.be.lessThan(52)
              })
          })
      })
