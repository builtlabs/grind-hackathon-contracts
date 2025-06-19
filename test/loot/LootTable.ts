import { loadFixture, mine } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

const oneEther = ethers.parseEther("1");

describe("LootTable", function () {
    async function fixture() {
        const [deployer] = await ethers.getSigners();

        const SUT = await ethers.getContractFactory("MockLootTable");
        const sut = await SUT.deploy();

        return {
            sut,
            wallet: deployer,
        };
    }

    async function predictableDeathTable() {
        const [deployer] = await ethers.getSigners();

        const SUT = await ethers.getContractFactory("PredictableDeathTable");
        const sut = await SUT.deploy();

        return {
            sut,
            wallet: deployer,
        };
    }

    async function noDeathTable() {
        const [deployer] = await ethers.getSigners();

        const SUT = await ethers.getContractFactory("NoDeathTable");
        const sut = await SUT.deploy();

        return {
            sut,
            wallet: deployer,
        };
    }

    // ############################ TESTS ############################

    describe("getLength", function () {
        it("Should return the length", async function () {
            const { sut } = await loadFixture(fixture);

            expect(await sut.getLength()).to.equal(1);
        });
    });

    describe("getMultipliers", function () {
        it("Should return the full array of multipliers", async function () {
            const { sut } = await loadFixture(fixture);

            const multipliers = await sut.getMultipliers();

            expect(multipliers.length).to.equal(1);
            expect(multipliers[0]).to.equal(BigInt(2e6));
        });
    });

    describe("getProbabilities", function () {
        it("Should return the full array of probabilities", async function () {
            const { sut } = await loadFixture(fixture);

            const probabilities = await sut.getProbabilities();

            expect(probabilities.length).to.equal(1);
            expect(probabilities[0]).to.equal(BigInt(5e17));
        });
    });

    describe("multiply", function () {
        it("Should revert if the index is out of range", async function () {
            const { sut } = await loadFixture(fixture);

            await expect(sut.multiply(oneEther, 1)).to.be.revertedWithCustomError(sut, "InvalidIndex");
        });

        it("Should return the value multiplied by the multiplier of the valid index", async function () {
            const { sut } = await loadFixture(fixture);

            expect(await sut.multiply(oneEther, 0)).to.equal(ethers.parseEther("2"));
        });
    });

    describe("isDead", function () {
        it("Should revert if the index is out of range", async function () {
            const { sut } = await loadFixture(fixture);

            await expect(sut.isDead(oneEther, 1)).to.be.revertedWithCustomError(sut, "InvalidIndex");
        });

        it("Should return true when the normalised rng is less than the probability at the valid index", async function () {
            const { sut } = await loadFixture(fixture);

            const padding = ethers.parseEther("100");
            const offset = ethers.parseEther("0.499");

            expect(await sut.isDead(padding + offset, 0)).to.equal(true);
        });

        it("Should return false when the normalised rng is greater than the probability at the valid index", async function () {
            const { sut } = await loadFixture(fixture);

            const padding = ethers.parseEther("100");
            const offset = ethers.parseEther("0.501");

            expect(await sut.isDead(padding + offset, 0)).to.equal(false);
        });
    });

    describe("getDeadIndex", function () {
        const salt = ethers.hexlify(ethers.randomBytes(32));

        it("Should revert if the block hash is not available", async function () {
            const { sut } = await loadFixture(fixture);

            const startBlock = await ethers.provider.getBlockNumber();
            await expect(sut.getDeadIndex(salt, startBlock)).to.be.revertedWithCustomError(sut, "MissingBlockhash");
        });

        it("Should get the expected dead index", async function () {
            const { sut } = await loadFixture(predictableDeathTable);

            const length = await sut.getLength();

            const startBlock = await ethers.provider.getBlockNumber();
            await mine(Number(length));

            expect(await sut.getDeadIndex(salt, startBlock)).to.equal(3);
        });

        it("Should return length when none of the probabilities cause a death", async function () {
            const { sut } = await loadFixture(noDeathTable);

            const length = await sut.getLength();

            const startBlock = await ethers.provider.getBlockNumber();
            await mine(Number(length));

            expect(await sut.getDeadIndex(salt, startBlock)).to.equal(length);
        });
    });
});
