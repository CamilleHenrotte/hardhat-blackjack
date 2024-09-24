const { ethers, getNamedAccounts } = require("hardhat")
const WAGER = ethers.utils.parseEther("0.01")

async function fundsContract() {
    const blackjack = await ethers.getContract("Blackjack")

    const { deployer, player } = await getNamedAccounts()
    const deployerSigner = await ethers.getSigner(deployer)

    // Log initial contract balance
    const initialContractBalance = await ethers.provider.getBalance(blackjack.address)
    console.log(`Initial contract balance: ${ethers.utils.formatEther(initialContractBalance)} ETH`)

    // Send funds to the blackjack contract
    const tx = await deployerSigner.sendTransaction({
        to: blackjack.address,
        value: WAGER.mul(8),
    })
    await tx.wait(1)
    console.log(`Deployer funded the contract with: ${ethers.utils.formatEther(WAGER.mul(8))} ETH`)
    const finalContractBalance = await ethers.provider.getBalance(blackjack.address)
    console.log(`Contract balance after funding: ${ethers.utils.formatEther(finalContractBalance)} ETH`)
}

fundsContract()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
