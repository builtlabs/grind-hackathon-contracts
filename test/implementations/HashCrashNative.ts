import { loadFixture, mine } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { id } from "ethers";
import { ethers } from "hardhat";

const lowLiquidityThreshold = ethers.parseEther("0.1");
const oneEther = ethers.parseEther("1");

function getHash(salt: string) {
    return ethers.keccak256(ethers.solidityPacked(["bytes32"], [salt]));
}

describe("HashCrashNative", function () {
    async function fixture() {
        const [deployer] = await ethers.getSigners();

        const genesisSalt = ethers.hexlify(ethers.randomBytes(32));

        const NativeBlocking = await ethers.getContractFactory("NativeBlocking");
        const nativeBlocking = await NativeBlocking.deploy();
        await nativeBlocking.waitForDeployment();

        const FixedRTP10x = await ethers.getContractFactory("FixedRTP10x");
        const lootTable = await FixedRTP10x.deploy();
        await lootTable.waitForDeployment();

        const HASHCRASH = await ethers.getContractFactory("HashCrashNative");
        const sut = await HASHCRASH.deploy(
            lootTable.target,
            getHash(genesisSalt),
            deployer.address,
            lowLiquidityThreshold,
            deployer.address
        );
        await sut.waitForDeployment();

        return {
            sut,
            lootTable,
            nativeBlocking,
            config: {
                introBlocks: 20,
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

        it("Should set the low liquidity threshold", async function () {
            const { sut } = await loadFixture(fixture);

            expect(await sut.getLowLiquidityThreshold()).to.equal(lowLiquidityThreshold);
        });

        it("Should set active to false", async function () {
            const { sut } = await loadFixture(fixture);

            expect(await sut.getActive()).to.equal(false);
        });

        it("Should set the intro blocks to 20", async function () {
            const { sut } = await loadFixture(fixture);

            expect(await sut.getIntroBlocks()).to.equal(20);
        });

        it("Should set the reduced intro blocks to 5", async function () {
            const { sut } = await loadFixture(fixture);

            expect(await sut.getReducedIntroBlocks()).to.equal(5);
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
            const { lootTable, config } = await loadFixture(fixture);

            const HASHCRASH = await ethers.getContractFactory("HashCrashNative");
            const tx = await HASHCRASH.deploy(
                lootTable.target,
                config.genesisHash,
                config.hashProducer,
                lowLiquidityThreshold,
                config.owner
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

    describe("integrations", function () {
        it("Should not get bricked by a malicious winner", async function () {
            const { sut, nativeBlocking, config } = await loadFixture(fixture);

            const liquidity = oneEther * 100n;

            await sut.deposit(liquidity, { value: liquidity });
            await sut.setActive(true);

            const LootTable = await ethers.getContractFactory("NoDeathTable");
            const lootTable = await LootTable.deploy();
            await lootTable.waitForDeployment();

            await sut.setLootTable(lootTable.target);

            const calldata = sut.interface.encodeFunctionData("placeBet", [oneEther, 3]);
            await nativeBlocking.call(sut.target, calldata, { value: oneEther });

            const length = await lootTable.getLength();
            await mine(config.introBlocks + Number(length));

            await expect(sut.reveal(config.genesisSalt, ethers.hexlify(ethers.randomBytes(32)))).to.not.be.reverted;
        });
    });
});
