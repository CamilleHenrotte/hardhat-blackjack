const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")
const { solidity } = require("ethereum-waffle")
const { assert, expect } = require("chai")
const chai = require("chai")

chai.use(solidity)

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("4- Dealer Fund and Proceeds Management", async () => {
          let blackjack,
              deployer,
              deployerSigner,
              player,
              wager,
              blackjackConnectedToPlayer2,
              blackjackConnectedToPlayer3
          beforeEach(async () => {
              deployer = (await getNamedAccounts()).deployer
              player = (await getNamedAccounts()).player
              player2 = (await getNamedAccounts()).player2
              player3 = (await getNamedAccounts()).player3
              deployerSigner = await ethers.getSigner(deployer)
              const playerSigner = await ethers.getSigner(player)
              const playerSigner2 = await ethers.getSigner(player2)
              const playerSigner3 = await ethers.getSigner(player3)
              await deployments.fixture(["all"])
              blackjackConnectedToDeployer = await ethers.getContract("BlackjackTest", deployer)
              blackjackConnectedToPlayer2 = await blackjackConnectedToDeployer.connect(playerSigner2)
              blackjackConnectedToPlayer3 = await blackjackConnectedToDeployer.connect(playerSigner3)
              blackjack = await blackjackConnectedToDeployer.connect(playerSigner)
              wager = ethers.utils.parseEther("0.1")
              await deployerSigner.sendTransaction({
                  to: blackjack.address,
                  value: wager.mul(8),
              })
          })
          describe("receive", async () => {
              it("funds the contract", async () => {
                  const balanceBeforeFunding = await blackjack.viewBalanceOfOwner()
                  await deployerSigner.sendTransaction({
                      to: blackjack.address,
                      value: wager.mul(4),
                  })

                  const balanceAfterFunding = await blackjack.viewBalanceOfOwner()
                  expect(balanceAfterFunding.sub(balanceBeforeFunding)).to.equal(wager.mul(4))
                  expect(balanceBeforeFunding).to.equal(wager.mul(8))
              })
          })

          describe("getLockedProceeds", async () => {
              it("returns the sum of proceeds currently in the game", async () => {
                  const lockedProceedsBeforePlayersEntered = await blackjack.getLockedProceeds()
                  await blackjack.fundAGame({ value: wager })
                  await blackjack.fundAGame({ value: wager })
                  await blackjackConnectedToPlayer2.fundAGame({ value: wager })
                  await blackjackConnectedToPlayer3.fundAGame({ value: wager })
                  const lockedProceedsAfterPlayersEntered = await blackjack.getLockedProceeds()
                  expect(lockedProceedsBeforePlayersEntered).to.equal(0)
                  expect(lockedProceedsAfterPlayersEntered).to.equal(wager.mul(4))
              })
          })
          describe("getAvailableProceeds", async () => {
              it("gets the proceeds available for the owner to withdraw, meaning the balance of the owner minus all the wagers in the game times two to pay the players if all of them win", async () => {
                  await blackjack.fundAGame({ value: wager })
                  await blackjackConnectedToPlayer2.fundAGame({ value: wager })
                  const balanceOfOwner = await blackjack.viewBalanceOfOwner()
                  const lockedProceeds = await blackjack.getLockedProceeds()
                  const availableProceeds = await blackjack.getAvailableProceeds()
                  expect(balanceOfOwner.sub(lockedProceeds.mul(2))).to.equal(availableProceeds)
              })
          })
          describe("withdrawMoneytoOwner", async () => {
              it("reverts if it is not the owner requesting the funds", async () => {
                  await expect(blackjack.withdrawMoneyToOwner(wager)).to.be.revertedWith("Blackjack__OnlyOwner")
              })
              it("sends the amount requested back to the owner if it is below the available proceeds", async () => {
                  blackjack = blackjackConnectedToDeployer
                  const deployerBalanceBeforeRequest = await ethers.provider.getBalance(deployer)
                  const contractBalanceBeforeRequest = await blackjack.viewBalanceOfOwner()

                  const tx = await blackjack.withdrawMoneyToOwner(wager)
                  const receipt = await tx.wait()

                  const gasUsed = receipt.gasUsed
                  const gasPrice = tx.gasPrice
                  const gasCost = gasUsed.mul(gasPrice)

                  const deployerBalanceAfterRequest = await ethers.provider.getBalance(deployer)
                  const contractBalanceAfterRequest = await blackjack.viewBalanceOfOwner()

                  expect(deployerBalanceAfterRequest.sub(deployerBalanceBeforeRequest)).to.equal(wager.sub(gasCost))
                  expect(contractBalanceBeforeRequest.sub(contractBalanceAfterRequest)).to.equal(wager)
              })
          })
          describe("fundAGame", async () => {
              it("reverts if the contract has not enough collateral", async () => {
                  await expect(blackjack.fundAGame({ value: wager.mul(10) })).to.be.revertedWith(
                      "Blackjack__DealerHasNotEnoughCollateral"
                  )
              })
              it("reverts if game is already started", async () => {
                  await blackjack.setGameStatus(player, true)
                  await expect(blackjack.fundAGame({ value: wager })).to.be.revertedWith(
                      "Blackjack__GameMustNotBeStarted"
                  )
              })
              it("funds a game and emits game funded", async () => {
                  const tx = await blackjack.fundAGame({ value: wager })

                  await expect(tx).to.emit(blackjack, "GameFunded").withArgs(player, wager)
                  const playerProceeed = await blackjack.getProceeds(player)
                  const players = await blackjack.getPlayers()
                  expect(playerProceeed).to.equal(wager)
                  expect(players[0]).to.equal(player)
              })
          })
          describe("withdrawMoneyToPlayer", async () => {
              it("reverts if game already started", async () => {
                  await blackjack.setGameStatus(player, true)
                  await expect(blackjack.withdrawMoneyToPlayer()).to.be.revertedWith("Blackjack__GameMustNotBeStarted")
              })

              it("allows player to withdraw when game not started", async () => {
                  await blackjack.fundAGame({ value: wager })
                  await expect(blackjack.withdrawMoneyToPlayer()).to.emit(blackjack, "PlayerWithdrawAllFunds")
                  const playerProceeds = await blackjack.getProceeds(player)
                  expect(playerProceeds).to.equal(0)
              })
          })
      })
