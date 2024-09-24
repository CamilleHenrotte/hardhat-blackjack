const { ethers, network } = require("hardhat")
const fs = require("fs")

const frontEndContractsFile = "../nextjs-blackjack/constants/networkMapping.json"
const frontEndAbiLocation = "../nextjs-blackjack/constants/"
module.exports = async function () {
    if (process.env.UPDATE_FRONT_END) {
        console.log("Updating front end ...")
        await updateContractAddresses()
        await updateAbi()
    }
}

async function updateAbi() {
    const blackjack = await ethers.getContract("Blackjack")
    fs.writeFileSync(`${frontEndAbiLocation}Blackjack.json`, blackjack.interface.format(ethers.utils.FormatTypes.json))
}

async function updateContractAddresses() {
    const blackjack = await ethers.getContract("Blackjack")
    const chainId = network.config.chainId.toString()
    const contractAddresses = JSON.parse(fs.readFileSync(frontEndContractsFile, "utf8"))
    if (chainId in contractAddresses) {
        if (!contractAddresses[chainId]["Blackjack"].includes(blackjack.address)) {
            contractAddresses[chainId]["Blackjack"].push(blackjack.address)
        }
    } else {
        contractAddresses[chainId] = { Blackjack: [blackjack.address] }
    }
    fs.writeFileSync(frontEndContractsFile, JSON.stringify(contractAddresses))
}

module.exports.tags = ["all", "frontend"]
