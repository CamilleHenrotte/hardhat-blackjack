const { ethers } = require("hardhat")

function Enum(...options) {
    return Object.fromEntries(options.map((key, i) => [key, ethers.BigNumber.from(i)]))
}

const CardValue = Enum(
    "Ace",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Jack",
    "Queen",
    "King"
)
const CardSuit = Enum("club", "diamond", "heart", "spade")
module.exports = { CardValue, CardSuit }
