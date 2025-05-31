import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

function getHash(salt: string) {
    return ethers.keccak256(ethers.toUtf8Bytes(salt));
}

describe("HashCrashNative", function () {
    async function fixture() {
        const [deployer] = await ethers.getSigners();

        const genesisSalt = ethers.hexlify(ethers.randomBytes(32));

        const LINEAR10x = await ethers.getContractFactory("Linear10x");
        const lootTable = await LINEAR10x.deploy();
        await lootTable.waitForDeployment();

        const HASHCRASH = await ethers.getContractFactory("HashCrashNative");
        const sut = await HASHCRASH.deploy(lootTable.target, getHash(genesisSalt), deployer.address, deployer.address);
        await sut.waitForDeployment();

        return {
            sut,
            lootTable,
            config: {
                genesisSalt,
                genesisHash: getHash(genesisSalt),
                hashProducer: deployer.address,
                owner: deployer.address,
            },
        };
    }

    describe("constructor", function () {
        it("Should set the owner address", async function () {
            const { sut, config } = await loadFixture(fixture);

            expect(await sut.owner()).to.equal(config.owner);
        });

        it("Should set active to false", async function () {
            const { sut } = await loadFixture(fixture);

            expect(await sut.getActive()).to.equal(false);
        });

        it("Should set the intro blocks to 20", async function () {
            const { sut } = await loadFixture(fixture);

            expect(await sut.getIntroBlocks()).to.equal(20);
        });

        it("Should set the genesis hash", async function () {
            const { sut, config } = await loadFixture(fixture);

            const roundInfo = await sut.getRoundInfo();
            expect(roundInfo[3]).to.equal(config.genesisHash);
        });

        it("Should set the hash producer", async function () {
            const { sut, config } = await loadFixture(fixture);

            expect( await sut.getHashProducer()).to.equal(config.hashProducer);
        });

        it("Should set the loot table", async function () {
            const { sut, lootTable } = await loadFixture(fixture);

            expect(await sut.getLootTable()).to.equal(lootTable.target);
        });

        it("Should emit LootTableUpdated", async function () {
            const { sut, lootTable, config } = await loadFixture(fixture);

            const HASHCRASH = await ethers.getContractFactory("HashCrashNative");
            expect(await HASHCRASH.deploy(lootTable.target, config.genesisHash, config.hashProducer, config.owner))
                .to.emit(sut, "LootTableUpdated")
                .withArgs(sut.target);
        });
    });
});
