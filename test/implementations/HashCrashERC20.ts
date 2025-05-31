import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { id } from "ethers";
import { ethers } from "hardhat";

function getHash(salt: string) {
    return ethers.keccak256(ethers.toUtf8Bytes(salt));
}

describe("HashCrashERC20", function () {
    async function fixture() {
        const [deployer] = await ethers.getSigners();

        const genesisSalt = ethers.hexlify(ethers.randomBytes(32));

        const TOKEN = await ethers.getContractFactory("DemoERC20");
        const token = await TOKEN.deploy();
        await token.waitForDeployment();

        const LINEAR10x = await ethers.getContractFactory("Linear10x");
        const lootTable = await LINEAR10x.deploy();
        await lootTable.waitForDeployment();

        const HASHCRASH = await ethers.getContractFactory("HashCrashERC20");
        const sut = await HASHCRASH.deploy(
            lootTable.target,
            getHash(genesisSalt),
            deployer.address,
            deployer.address,
            token.target
        );
        await sut.waitForDeployment();

        return {
            sut,
            token,
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
        it("Should set the token address", async function () {
            const { sut, token } = await loadFixture(fixture);
            expect(await sut.token()).to.equal(token.target);
        });

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

            expect(await sut.getHashProducer()).to.equal(config.hashProducer);
        });

        it("Should set the loot table", async function () {
            const { sut, lootTable } = await loadFixture(fixture);

            expect(await sut.getLootTable()).to.equal(lootTable.target);
        });

        it("Should emit LootTableUpdated", async function () {
            const { token, lootTable, config } = await loadFixture(fixture);

            const HASHCRASH = await ethers.getContractFactory("HashCrashERC20");
            const tx = await HASHCRASH.deploy(
                lootTable.target,
                config.genesisHash,
                config.hashProducer,
                config.owner,
                token.target
            );
            const receipt = (await tx.deploymentTransaction()!.wait())!;

            const iface = HASHCRASH.interface;

            const platformSetTopic = id("LootTableUpdated(address)");

            const events = receipt.logs
                .filter((log) => log.topics[0] === platformSetTopic)
                .map((log) => iface.decodeEventLog("LootTableUpdated", log.data, log.topics));

            expect(events).to.deep.include.members([[lootTable.target]]);
        });
    });
});
