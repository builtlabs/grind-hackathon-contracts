import { loadFixture, mine } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { id } from "ethers";
import { ethers } from "hardhat";

const _MAX_BET_QUEUE_SIZE = 128n;
const _MAX_LIQUIDITY_QUEUE_SIZE = 64n;

const lowLiquidityThreshold = ethers.parseEther("0.1");
const minimumValue = ethers.parseEther("0.01");
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

        const NativeGasAbuser = await ethers.getContractFactory("NativeGasAbuser");
        const nativeGasAbuser = await NativeGasAbuser.deploy();
        await nativeGasAbuser.waitForDeployment();

        const FixedRTP10x = await ethers.getContractFactory("FixedRTP10x");
        const lootTable = await FixedRTP10x.deploy();
        await lootTable.waitForDeployment();

        const HASHCRASH = await ethers.getContractFactory("HashCrashNative");
        const sut = await HASHCRASH.deploy(
            lootTable.target,
            getHash(genesisSalt),
            deployer.address,
            lowLiquidityThreshold,
            minimumValue,
            deployer.address
        );
        await sut.waitForDeployment();

        return {
            sut,
            lootTable,
            nativeBlocking,
            nativeGasAbuser,
            wallets: {
                deployer,
            },
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

        it("Should set the minimum value", async function () {
            const { sut } = await loadFixture(fixture);

            expect(await sut.getMinimum()).to.equal(minimumValue);
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

        it("Should set the cancel return to 9700 (97%)", async function () {
            const { sut } = await loadFixture(fixture);

            expect(await sut.getCancelReturnNumerator()).to.equal(9700);
        });

        it("Should set the genesis hash", async function () {
            const { sut, config } = await loadFixture(fixture);

            expect(await sut.getRoundHash()).to.equal(config.genesisHash);
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
                minimumValue,
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
        // NOTE: The max is around 8m if every single receive reverts, 3m otherwise.
        const softcap = 10000000n;
        const batchSize = 64n;

        async function integrationFixture() {
            const { sut, wallets, config } = await fixture();

            await sut.setActive(true);

            const initialBalance = ethers.parseEther("1000");
            await sut.deposit(initialBalance, { value: initialBalance });

            const MaliciousBetter = await ethers.getContractFactory("MaliciousBetter");
            const maliciousBetter = await MaliciousBetter.deploy();
            await maliciousBetter.waitForDeployment();

            const MaliciousLiquidityProvider = await ethers.getContractFactory("MaliciousLiquidityProvider");
            const maliciousLiquidityProvider = await MaliciousLiquidityProvider.deploy();
            await maliciousLiquidityProvider.waitForDeployment();

            const NoDeathTable = await ethers.getContractFactory("NoDeathTable");
            const lootTable = await NoDeathTable.deploy();
            await lootTable.waitForDeployment();

            await sut.setLootTable(lootTable.target);

            return { sut, lootTable, wallets, config, maliciousBetter, maliciousLiquidityProvider };
        }

        async function integrationFixtureWithDeposits() {
            const { sut, lootTable, wallets, config, maliciousBetter, maliciousLiquidityProvider } =
                await integrationFixture();

            const minimum = await sut.getMinimum();
            const length = Number(await lootTable.getLength());

            await sut.placeBet(minimum, length - 1, { value: minimum });

            let remaining = _MAX_LIQUIDITY_QUEUE_SIZE;
            let startIndex = 0n;
            while (remaining > 0n) {
                const deposits = remaining > batchSize ? batchSize : remaining;
                await maliciousLiquidityProvider.multiDepositNative(sut.target, deposits, startIndex, {
                    value: minimum * deposits,
                });
                remaining -= deposits;
                startIndex += deposits;
            }
            await mine(config.introBlocks + length);
            await sut.reveal(config.genesisSalt, config.genesisHash);

            return { sut, lootTable, wallets, config, maliciousBetter, maliciousLiquidityProvider };
        }

        it("Should reveal with max winning bets", async function () {
            const { sut, lootTable, maliciousBetter, config } = await loadFixture(integrationFixture);

            const minBet = await sut.getMinimum();
            const length = Number(await lootTable.getLength());

            let remaining = _MAX_BET_QUEUE_SIZE;
            while (remaining > 0n) {
                const bets = remaining > batchSize ? batchSize : remaining;
                await maliciousBetter.multiBetNative(sut.target, bets, minBet, length - 1, {
                    value: minBet * bets,
                });
                remaining -= bets;
            }

            await mine(config.introBlocks + length);

            const tx = await sut.reveal(config.genesisSalt, config.genesisHash);
            const receipt = await tx.wait();

            if (!receipt) {
                throw new Error("Reveal transaction failed");
            }

            expect(receipt.gasUsed).to.be.lessThan(softcap);
        });

        it("Should reveal with max cancelled bets", async function () {
            const { sut, lootTable, maliciousBetter, config } = await loadFixture(integrationFixture);

            const minBet = await sut.getMinimum();
            const length = Number(await lootTable.getLength());

            let remaining = _MAX_BET_QUEUE_SIZE;
            let startIndex = 0n;
            while (remaining > 0n) {
                const bets = remaining > batchSize ? batchSize : remaining;
                await maliciousBetter.multiBetCancelNative(sut.target, bets, minBet, length - 1, startIndex, {
                    value: minBet * bets,
                });
                remaining -= bets;
                startIndex += bets;
            }

            await mine(config.introBlocks + length);

            const tx = await sut.reveal(config.genesisSalt, config.genesisHash);
            const receipt = await tx.wait();

            if (!receipt) {
                throw new Error("Reveal transaction failed");
            }

            expect(receipt.gasUsed).to.be.lessThan(softcap);
        });

        it("Should reveal with max liquidity queue", async function () {
            const { sut, lootTable, maliciousLiquidityProvider, config } =
                await loadFixture(integrationFixtureWithDeposits);

            const minDeposit = await sut.getMinimum();
            const length = Number(await lootTable.getLength());

            await sut.placeBet(minDeposit, length - 1, { value: minDeposit });

            let remaining = _MAX_LIQUIDITY_QUEUE_SIZE;
            let startIndex = 0n;
            while (remaining > 0n) {
                const withdraws = remaining > batchSize ? batchSize : remaining;
                await maliciousLiquidityProvider.multiWithdraw(sut.target, withdraws, startIndex);
                remaining -= withdraws;
                startIndex += withdraws;
            }

            await mine(config.introBlocks + length);

            const tx = await sut.reveal(config.genesisSalt, config.genesisHash);
            const receipt = await tx.wait();

            if (!receipt) {
                throw new Error("Reveal transaction failed");
            }

            expect(receipt.gasUsed).to.be.lessThan(softcap);
        });

        it("Should reveal with max winning bets AND liquidity queue", async function () {
            const { sut, lootTable, maliciousBetter, maliciousLiquidityProvider, config } =
                await loadFixture(integrationFixtureWithDeposits);

            const minimum = await sut.getMinimum();
            const length = Number(await lootTable.getLength());

            let remaining = _MAX_BET_QUEUE_SIZE;
            while (remaining > 0n) {
                const bets = remaining > batchSize ? batchSize : remaining;
                await maliciousBetter.multiBetNative(sut.target, bets, minimum, length - 1, {
                    value: minimum * bets,
                });
                remaining -= bets;
            }

            remaining = _MAX_LIQUIDITY_QUEUE_SIZE;
            let startIndex = 0n;
            while (remaining > 0n) {
                const withdraws = remaining > batchSize ? batchSize : remaining;
                await maliciousLiquidityProvider.multiWithdraw(sut.target, withdraws, startIndex);
                remaining -= withdraws;
                startIndex += withdraws;
            }

            await mine(config.introBlocks + length);

            const tx = await sut.reveal(config.genesisSalt, config.genesisHash);
            const receipt = await tx.wait();

            if (!receipt) {
                throw new Error("Reveal transaction failed");
            }

            expect(receipt.gasUsed).to.be.lessThan(softcap);
        });

        it("Should not get bricked by a malicious winner using revert", async function () {
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

        it("Should not get bricked by a malicious winner using infinite gas", async function () {
            const { sut, nativeGasAbuser, config } = await loadFixture(fixture);

            const liquidity = oneEther * 100n;

            await sut.deposit(liquidity, { value: liquidity });
            await sut.setActive(true);

            const LootTable = await ethers.getContractFactory("NoDeathTable");
            const lootTable = await LootTable.deploy();
            await lootTable.waitForDeployment();

            await sut.setLootTable(lootTable.target);

            const calldata = sut.interface.encodeFunctionData("placeBet", [oneEther, 3]);
            await nativeGasAbuser.call(sut.target, calldata, { value: oneEther });

            const length = await lootTable.getLength();
            await mine(config.introBlocks + Number(length));

            await expect(sut.reveal(config.genesisSalt, ethers.hexlify(ethers.randomBytes(32)))).to.not.be.reverted;
        });
    });
});
