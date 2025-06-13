import { loadFixture, mine } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { id } from "ethers";

const lowLiquidityThreshold = ethers.parseEther("0.1");
const minimumValue = ethers.parseEther("0.001");
const initialBalance = ethers.parseEther("1000");
const oneEther = ethers.parseEther("1");

function getHash(salt: string) {
    return ethers.keccak256(ethers.solidityPacked(["bytes32"], [salt]));
}

describe("HashCrash", function () {
    async function baseFixture() {
        const [deployer, alice, bob, charlie, dave] = await ethers.getSigners();

        const genesisSalt = ethers.hexlify(ethers.randomBytes(32));

        const TOKEN = await ethers.getContractFactory("MockERC20");
        const token = await TOKEN.deploy();
        await token.waitForDeployment();

        const FixedRTP10x = await ethers.getContractFactory("FixedRTP10x");
        const lootTable = await FixedRTP10x.deploy();
        await lootTable.waitForDeployment();

        const HASHCRASH = await ethers.getContractFactory("HashCrashHarness");
        const sut = await HASHCRASH.deploy(
            lootTable.target,
            getHash(genesisSalt),
            deployer.address,
            lowLiquidityThreshold,
            minimumValue,
            deployer.address,
            token.target
        );
        await sut.waitForDeployment();

        return {
            sut,
            token,
            lootTable,
            wallets: {
                deployer,
                alice,
                bob,
                charlie,
                dave,
            },
            config: {
                genesisSalt,
                genesisHash: getHash(genesisSalt),
                hashProducer: deployer.address,
                owner: deployer.address,
                introBlocks: 20,
                reducedIntroBlocks: 5,
                cancelReturnNumerator: 9700n, // 97%
                liquidityPerRound: (total: bigint) => (total * 1000n) / 10000n,
            },
        };
    }

    async function activeFixture() {
        const { sut, lootTable, token, wallets, config } = await baseFixture();

        await sut.setActive(true);

        return { sut, lootTable, token, wallets, config };
    }

    async function tokenBalanceFixture() {
        const { sut, lootTable, token, wallets, config } = await activeFixture();

        // Mint some tokens to the wallets
        await token.mint(wallets.deployer.address, initialBalance);
        await token.mint(wallets.alice.address, initialBalance);
        await token.mint(wallets.bob.address, initialBalance);
        await token.mint(wallets.charlie.address, initialBalance);
        await token.mint(wallets.dave.address, initialBalance);

        // Approve the contract to spend tokens on behalf of the wallets
        await token.connect(wallets.deployer).approve(sut.target, initialBalance);
        await token.connect(wallets.alice).approve(sut.target, initialBalance);
        await token.connect(wallets.bob).approve(sut.target, initialBalance);
        await token.connect(wallets.charlie).approve(sut.target, initialBalance);
        await token.connect(wallets.dave).approve(sut.target, initialBalance);

        return { sut, lootTable, token, wallets, config };
    }

    async function liquidFixture() {
        const { sut, lootTable, token, wallets, config } = await tokenBalanceFixture();

        // Deposit some tokens into the contract
        await sut.deposit(initialBalance);

        // Restore the token balance for the deployer
        await token.mint(wallets.deployer.address, initialBalance);
        await token.approve(sut.target, initialBalance);

        return { sut, lootTable, token, wallets, config };
    }

    async function predictableDeathTable() {
        const { sut, token, wallets, config } = await liquidFixture();

        const LootTable = await ethers.getContractFactory("PredictableDeathTable");
        const lootTable = await LootTable.deploy();
        await lootTable.waitForDeployment();

        await sut.setLootTable(lootTable.target);

        const bets = [
            { wallet: wallets.deployer, amount: oneEther, cashoutIndex: 0 },
            { wallet: wallets.alice, amount: oneEther, cashoutIndex: 1 },
            { wallet: wallets.bob, amount: oneEther, cashoutIndex: 2 },
            { wallet: wallets.charlie, amount: oneEther, cashoutIndex: 3 },
            { wallet: wallets.dave, amount: oneEther, cashoutIndex: 4 },
        ];

        for (const bet of bets) {
            await sut.connect(bet.wallet).placeBet(bet.amount, bet.cashoutIndex);
        }

        return { sut, lootTable, token, wallets, config: { ...config, bets, introBlocks: config.introBlocks - 5 } };
    }

    async function noDeathTable() {
        const { sut, token, wallets, config } = await liquidFixture();

        const LootTable = await ethers.getContractFactory("NoDeathTable");
        const lootTable = await LootTable.deploy();
        await lootTable.waitForDeployment();

        await sut.setLootTable(lootTable.target);

        const bets = [
            { wallet: wallets.deployer, amount: oneEther, cashoutIndex: 0 },
            { wallet: wallets.alice, amount: oneEther, cashoutIndex: 1 },
            { wallet: wallets.bob, amount: oneEther, cashoutIndex: 2 },
            { wallet: wallets.charlie, amount: oneEther, cashoutIndex: 3 },
            { wallet: wallets.dave, amount: oneEther, cashoutIndex: 4 },
        ];

        for (const bet of bets) {
            await sut.connect(bet.wallet).placeBet(bet.amount, bet.cashoutIndex);
        }

        return { sut, lootTable, token, wallets, config: { ...config, bets, introBlocks: config.introBlocks - 5 } };
    }

    async function betFixture() {
        const { sut, lootTable, token, wallets, config } = await liquidFixture();

        const bets = [
            { wallet: wallets.deployer, amount: oneEther, cashoutIndex: 10 },
            { wallet: wallets.alice, amount: oneEther * 2n, cashoutIndex: 9 },
            { wallet: wallets.bob, amount: oneEther * 3n, cashoutIndex: 8 },
            { wallet: wallets.charlie, amount: oneEther * 4n, cashoutIndex: 7 },
        ];

        for (const bet of bets) {
            await sut.connect(bet.wallet).placeBet(bet.amount, bet.cashoutIndex);
        }

        return { sut, lootTable, token, wallets, config: { ...config, bets, introBlocks: config.introBlocks - 4 } };
    }

    async function completedBetFixture() {
        const { sut, lootTable, token, wallets, config } = await betFixture();

        const length = Number(await lootTable.getLength());
        await mine(config.introBlocks + length + 1); // + 1 otherwise cant read that final block hash

        const info = await sut.getRoundInfo();
        const deadIndex = await lootTable.getDeadIndex(config.genesisSalt, info[1]);

        return { sut, lootTable, token, wallets, config: { ...config, deadIndex } };
    }

    async function unrecoverableRoundFixture() {
        const fixture = await completedBetFixture();

        await mine(1000);

        return fixture;
    }

    // ############################ TESTS ############################

    describe("Integration Tests", function () {
        it.skip("Should not be possible to brick the reveal function using many bets", async function () {
            const { sut, token, lootTable, config } = await loadFixture(liquidFixture);

            const MaliciousBetter = await ethers.getContractFactory("MaliciousBetter");
            const maliciousBetter = await MaliciousBetter.deploy(sut.target);
            await maliciousBetter.waitForDeployment();

            await sut.setMinimum(1n);

            // NOTE: Abstract does not actually have a gas limit, but we still dont want this to be too expensive
            const softcap = 30000000n;

            const multibets = 5;

            const betAmount = 100n;
            const cashoutIndex = 10n;
            const tokenPerBet = 1000n;

            const totalAmount = tokenPerBet * betAmount;

            await token.mint(maliciousBetter.target, totalAmount * BigInt(multibets));
            await maliciousBetter.approve(token.target, totalAmount * BigInt(multibets));

            for (let i = 0; i < multibets; i++) {
                await maliciousBetter.multiBet(betAmount, totalAmount, cashoutIndex);
                await maliciousBetter.multiCancel(
                    Array.from({ length: Number(betAmount) }, (_, j) => j + i * Number(betAmount))
                );
            }

            const length = Number(await lootTable.getLength());
            await mine(config.introBlocks + length + 1);

            const tx = await sut.reveal(config.genesisSalt, ethers.hexlify(ethers.randomBytes(32)));
            const receipt = await tx.wait();

            if (!receipt) {
                throw new Error("Reveal failed");
            }

            console.log(`Reveal gas used: ${receipt.gasUsed.toString()} for ${multibets * Number(betAmount)} bets`);
            expect(receipt.gasUsed).to.be.lessThan(softcap);
        });
    });

    describe("constructor", function () {
        it("Should set the owner address", async function () {
            const { sut, config } = await loadFixture(baseFixture);

            expect(await sut.owner()).to.equal(config.owner);
        });

        it("Should set the low liquidity threshold", async function () {
            const { sut } = await loadFixture(baseFixture);

            expect(await sut.getLowLiquidityThreshold()).to.equal(lowLiquidityThreshold);
        });

        it("Should set the minimum value", async function () {
            const { sut } = await loadFixture(baseFixture);

            expect(await sut.getMinimum()).to.equal(minimumValue);
        });

        it("Should set active to false", async function () {
            const { sut } = await loadFixture(baseFixture);

            expect(await sut.getActive()).to.equal(false);
        });

        it("Should set the intro blocks to 20", async function () {
            const { sut, config } = await loadFixture(baseFixture);

            expect(await sut.getIntroBlocks()).to.equal(config.introBlocks);
        });

        it("Should set the reduced intro blocks to 5", async function () {
            const { sut, config } = await loadFixture(baseFixture);

            expect(await sut.getReducedIntroBlocks()).to.equal(config.reducedIntroBlocks);
        });

        it("Should set the cancel return to 9700 (97%)", async function () {
            const { sut, config } = await loadFixture(baseFixture);

            expect(await sut.getCancelReturnNumerator()).to.equal(config.cancelReturnNumerator);
        });

        it("Should set the genesis hash", async function () {
            const { sut, config } = await loadFixture(baseFixture);

            const roundInfo = await sut.getRoundInfo();
            expect(roundInfo[3]).to.equal(config.genesisHash);
        });

        it("Should set the hash producer", async function () {
            const { sut, config } = await loadFixture(baseFixture);

            expect(await sut.getHashProducer()).to.equal(config.hashProducer);
        });

        it("Should set the loot table", async function () {
            const { sut, lootTable } = await loadFixture(baseFixture);

            expect(await sut.getLootTable()).to.equal(lootTable.target);
        });

        it("Should emit LootTableUpdated", async function () {
            const { token, lootTable, config } = await loadFixture(baseFixture);

            const HASHCRASH = await ethers.getContractFactory("HashCrashHarness");
            const tx = await HASHCRASH.deploy(
                lootTable.target,
                config.genesisHash,
                config.hashProducer,
                lowLiquidityThreshold,
                minimumValue,
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

    describe("getActive", function () {
        it("Should return false by default", async function () {
            const { sut } = await loadFixture(baseFixture);

            expect(await sut.getActive()).to.equal(false);
        });

        it("Should return the set _active value", async function () {
            const { sut } = await loadFixture(activeFixture);

            expect(await sut.getActive()).to.equal(true);
        });
    });

    describe("getLootTable", function () {
        it("Should return the loot table", async function () {
            const { sut, lootTable } = await loadFixture(baseFixture);

            expect(await sut.getLootTable()).to.equal(lootTable.target);
        });
    });

    describe("getStagedLootTable", function () {
        it("Should return address(0) by default", async function () {
            const { sut } = await loadFixture(baseFixture);

            expect(await sut.getStagedLootTable()).to.equal(ethers.ZeroAddress);
        });

        it("Should return the staged loot table", async function () {
            const { sut, wallets } = await loadFixture(liquidFixture);

            await sut.placeBet(oneEther, 10);
            await sut.setLootTable(wallets.bob.address);

            expect(await sut.getStagedLootTable()).to.equal(wallets.bob.address);
        });
    });

    describe("getHashProducer", function () {
        it("Should return the hash producer", async function () {
            const { sut, config } = await loadFixture(baseFixture);

            expect(await sut.getHashProducer()).to.equal(config.hashProducer);
        });
    });

    describe("getIntroBlocks", function () {
        it("Should return the set intro blocks", async function () {
            const { sut, config } = await loadFixture(baseFixture);

            expect(await sut.getIntroBlocks()).to.equal(config.introBlocks);
        });
    });

    describe("getReducedIntroBlocks", function () {
        it("Should return the set reduced intro blocks", async function () {
            const { sut, config } = await loadFixture(baseFixture);

            expect(await sut.getReducedIntroBlocks()).to.equal(config.reducedIntroBlocks);
        });
    });

    describe("getCancelReturnNumerator", function () {
        it("Should return the cancel return numerator", async function () {
            const { sut, config } = await loadFixture(baseFixture);

            expect(await sut.getCancelReturnNumerator()).to.equal(config.cancelReturnNumerator);
        });
    });

    describe("getBetsFor", function () {
        it("Should return an empty array by default", async function () {
            const { sut } = await loadFixture(baseFixture);

            expect(await sut.getBetsFor(ethers.ZeroAddress)).to.deep.equal([]);
        });

        it("Should return the bets for the user", async function () {
            const { sut, wallets } = await loadFixture(liquidFixture);

            const cashoutIndex = 10;

            await sut.placeBet(oneEther, cashoutIndex);
            await sut.connect(wallets.alice).placeBet(oneEther, cashoutIndex);

            const bets = await sut.getBetsFor(wallets.deployer.address);
            expect(bets.length).to.equal(1);

            expect(bets[0].user).to.equal(wallets.deployer.address);
            expect(bets[0].amount).to.equal(oneEther);
            expect(bets[0].cashoutIndex).to.equal(cashoutIndex);
            expect(bets[0].cancelled).to.equal(false);
        });
    });

    describe("getRoundInfo", function () {
        describe("startBlock_", function () {
            it("Should return the start block at 0", async function () {
                const { sut } = await loadFixture(baseFixture);

                const roundInfo = await sut.getRoundInfo();
                expect(roundInfo[1]).to.equal(0);
            });

            it("Should return the start block when set", async function () {
                const { sut, config } = await loadFixture(liquidFixture);

                await sut.placeBet(oneEther, 10);

                const currentBlock = await ethers.provider.getBlockNumber();
                const roundInfo = await sut.getRoundInfo();

                expect(roundInfo[1]).to.equal(currentBlock + config.introBlocks);
            });
        });

        describe("roundLiquidity_", function () {
            it("Should return the round liquidity when zero", async function () {
                const { sut } = await loadFixture(baseFixture);

                const roundInfo = await sut.getRoundInfo();
                expect(roundInfo[1]).to.equal(0);
            });

            it("Should return the round liquidity when set", async function () {
                const { sut, config } = await loadFixture(tokenBalanceFixture);

                await sut.deposit(oneEther);

                const roundInfo = await sut.getRoundInfo();
                expect(roundInfo[2]).to.equal(config.liquidityPerRound(oneEther));
            });
        });

        describe("hash_", function () {
            it("Should return the round hash", async function () {
                const { sut, config } = await loadFixture(baseFixture);

                const roundInfo = await sut.getRoundInfo();
                expect(roundInfo[3]).to.equal(config.genesisHash);
            });
        });

        describe("bets_", function () {
            it("Should return an empty array by default", async function () {
                const { sut } = await loadFixture(baseFixture);

                const roundInfo = await sut.getRoundInfo();
                expect(roundInfo[4]).to.deep.equal([]);
            });

            it("Should return the bets", async function () {
                const { sut, wallets } = await loadFixture(liquidFixture);

                const cashoutIndex = 10;

                await sut.placeBet(oneEther, cashoutIndex);

                const roundInfo = await sut.getRoundInfo();
                const bets = roundInfo[4];
                expect(bets.length).to.equal(1);

                expect(bets[0].user).to.equal(wallets.deployer.address);
                expect(bets[0].amount).to.equal(oneEther);
                expect(bets[0].cashoutIndex).to.equal(cashoutIndex);
                expect(bets[0].cancelled).to.equal(false);
            });
        });

        describe("blockHashes_", function () {
            it("Should return no block hashes when the round is idle", async function () {
                const { sut } = await loadFixture(baseFixture);

                const roundInfo = await sut.getRoundInfo();
                expect(roundInfo[5]).to.deep.equal([]);
            });

            it("Should return no block hashes before the start block", async function () {
                const { sut } = await loadFixture(liquidFixture);

                await sut.placeBet(oneEther, 10);

                const roundInfo = await sut.getRoundInfo();
                expect(roundInfo[5]).to.deep.equal([]);
            });

            it("Should return no block hashes on the start block", async function () {
                const { sut, config } = await loadFixture(liquidFixture);

                await sut.placeBet(oneEther, 10);

                await mine(config.introBlocks);

                const roundInfo = await sut.getRoundInfo();

                expect(await ethers.provider.getBlockNumber()).to.equal(roundInfo[1]);
                expect(roundInfo[5]).to.deep.equal([]);
            });

            it("Should return all block hashes between the start block (inc) and current block (exc)", async function () {
                const { sut, config } = await loadFixture(liquidFixture);

                const amount = 5;

                await sut.placeBet(oneEther, 10);

                await mine(config.introBlocks);

                const startBlock = await ethers.provider.getBlockNumber();

                await mine(amount);

                const roundInfo = await sut.getRoundInfo();
                expect(roundInfo[5].length).to.equal(amount);
                for (let i = 0; i < amount; i++) {
                    expect(roundInfo[5][i]).to.equal(
                        await ethers.provider.getBlock(startBlock + i).then((b) => b!.hash)
                    );
                }
            });

            it("Should return at max, loot table length block hashes", async function () {
                const { sut, lootTable, config } = await loadFixture(liquidFixture);

                await sut.placeBet(oneEther, 10);

                await mine(config.introBlocks);

                const startBlock = await ethers.provider.getBlockNumber();

                const lootTableLength = Number(await lootTable.getLength());
                await mine(lootTableLength * 2);

                const roundInfo = await sut.getRoundInfo();
                expect(roundInfo[5].length).to.equal(lootTableLength);
                for (let i = 0; i < lootTableLength; i++) {
                    expect(roundInfo[5][i]).to.equal(
                        await ethers.provider.getBlock(startBlock + i).then((b) => b!.hash)
                    );
                }
            });

            it("Should return bytes32(0) when the hashes are no longer available", async function () {
                const { sut, lootTable } = await loadFixture(liquidFixture);

                await sut.placeBet(oneEther, 10);

                await mine(1000);

                const lootTableLength = Number(await lootTable.getLength());
                const roundInfo = await sut.getRoundInfo();
                expect(roundInfo[5].length).to.equal(lootTableLength);
                for (let i = 0; i < lootTableLength; i++) {
                    expect(roundInfo[5][i]).to.equal(
                        "0x0000000000000000000000000000000000000000000000000000000000000000"
                    );
                }
            });
        });
    });

    describe("setActive", function () {
        it("Should revert if the caller is not the owner", async function () {
            const { sut, wallets } = await loadFixture(baseFixture);

            await expect(sut.connect(wallets.alice).setActive(true)).to.be.revertedWithCustomError(
                sut,
                "OwnableUnauthorizedAccount"
            );
        });

        it("Should do nothing when the same value is passed", async function () {
            const { sut } = await loadFixture(baseFixture);

            expect(await sut.getActive()).to.equal(false);
            await sut.setActive(false);
            expect(await sut.getActive()).to.equal(false);
        });

        it("Should set active", async function () {
            const { sut } = await loadFixture(baseFixture);

            await sut.setActive(true);

            expect(await sut.getActive()).to.equal(true);
        });

        it("Should emit ActiveUpdated", async function () {
            const { sut } = await loadFixture(baseFixture);

            await expect(sut.setActive(true)).to.emit(sut, "ActiveUpdated").withArgs(true);
        });
    });

    describe("setHashProducer", function () {
        it("Should revert if the caller is not the owner", async function () {
            const { sut, wallets } = await loadFixture(baseFixture);

            await expect(sut.connect(wallets.alice).setHashProducer(wallets.bob.address)).to.be.revertedWithCustomError(
                sut,
                "OwnableUnauthorizedAccount"
            );
        });

        it("Should set the hash producer", async function () {
            const { sut, wallets } = await loadFixture(baseFixture);

            await sut.setHashProducer(wallets.bob.address);

            expect(await sut.getHashProducer()).to.equal(wallets.bob.address);
        });
    });

    describe("setCancelReturnNumerator", function () {
        it("Should revert if the caller is not the owner", async function () {
            const { sut, wallets } = await loadFixture(baseFixture);

            await expect(sut.connect(wallets.alice).setCancelReturnNumerator(10)).to.be.revertedWithCustomError(
                sut,
                "OwnableUnauthorizedAccount"
            );
        });

        it("Should revert if the value is greater than 10000", async function () {
            const { sut } = await loadFixture(baseFixture);

            await expect(sut.setCancelReturnNumerator(10001)).to.be.revertedWithCustomError(
                sut,
                "InvalidCancelReturnNumeratorError"
            );
        });

        it("Should set the cancel return numerator", async function () {
            const { sut } = await loadFixture(baseFixture);

            await sut.setCancelReturnNumerator(10);

            expect(await sut.getCancelReturnNumerator()).to.equal(10);
        });
    });

    describe("setIntroBlocks", function () {
        it("Should revert if the caller is not the owner", async function () {
            const { sut, wallets } = await loadFixture(baseFixture);

            await expect(sut.connect(wallets.alice).setIntroBlocks(10)).to.be.revertedWithCustomError(
                sut,
                "OwnableUnauthorizedAccount"
            );
        });

        it("Should set the intro blocks", async function () {
            const { sut } = await loadFixture(baseFixture);

            await sut.setIntroBlocks(10);

            expect(await sut.getIntroBlocks()).to.equal(10);
        });
    });

    describe("setReducedIntroBlocks", function () {
        it("Should revert if the caller is not the owner", async function () {
            const { sut, wallets } = await loadFixture(baseFixture);

            await expect(sut.connect(wallets.alice).setReducedIntroBlocks(10)).to.be.revertedWithCustomError(
                sut,
                "OwnableUnauthorizedAccount"
            );
        });

        it("Should set the reduced intro blocks", async function () {
            const { sut } = await loadFixture(baseFixture);

            await sut.setReducedIntroBlocks(10);

            expect(await sut.getReducedIntroBlocks()).to.equal(10);
        });
    });

    describe("setLootTable", function () {
        it("Should revert if the caller is not the owner", async function () {
            const { sut, wallets } = await loadFixture(baseFixture);

            await expect(sut.connect(wallets.alice).setLootTable(wallets.bob.address)).to.be.revertedWithCustomError(
                sut,
                "OwnableUnauthorizedAccount"
            );
        });

        it("Should set the loot table address", async function () {
            const { sut } = await loadFixture(baseFixture);

            await sut.setLootTable(ethers.ZeroAddress);

            expect(await sut.getLootTable()).to.equal(ethers.ZeroAddress);
        });

        it("Should stage the loot table when not idle", async function () {
            const { sut, wallets } = await loadFixture(liquidFixture);

            await sut.placeBet(oneEther, 10);

            await sut.setLootTable(wallets.bob.address);

            expect(await sut.getLootTable()).to.not.equal(wallets.bob.address);
            expect(await sut.getStagedLootTable()).to.equal(wallets.bob.address);
        });
    });

    describe("placeBet", function () {
        it("Should revert if the amount is below the minimum", async function () {
            const { sut } = await loadFixture(liquidFixture);

            await expect(sut.placeBet(minimumValue - 1n, 10)).to.be.revertedWithCustomError(
                sut,
                "ValueHolderValueTooSmall"
            );
        });

        describe("_initialiseRound", function () {
            it("Should revert if active is not set", async function () {
                const { sut } = await loadFixture(liquidFixture);

                await sut.setActive(false);

                await expect(sut.placeBet(oneEther, 10)).to.be.revertedWithCustomError(sut, "NotActiveError");
            });

            describe("has staged loot table", function () {
                async function stagedLootTableFixture() {
                    const { sut, lootTable, token, wallets, config } = await loadFixture(liquidFixture);

                    const FixedRTP100x = await ethers.getContractFactory("FixedRTP100x");
                    const stagedLootTable = await FixedRTP100x.deploy();
                    await stagedLootTable.waitForDeployment();

                    await sut.placeBet(oneEther, 10);
                    await sut.setLootTable(stagedLootTable.target);

                    await mine(config.introBlocks + Number(await lootTable.getLength()));

                    await sut.reveal(config.genesisSalt, config.genesisHash);

                    expect(await sut.getStagedLootTable()).to.equal(stagedLootTable.target);

                    return {
                        sut,
                        lootTable,
                        token,
                        wallets,
                        config: {
                            ...config,
                            stagedLootTable,
                        },
                    };
                }

                it("Should update the loot table", async function () {
                    const { sut, config } = await loadFixture(stagedLootTableFixture);

                    await sut.placeBet(oneEther, 10);

                    expect(await sut.getLootTable()).to.equal(config.stagedLootTable.target);
                });

                it("Should emit LootTableUpdated", async function () {
                    const { sut, config } = await loadFixture(stagedLootTableFixture);

                    await expect(sut.placeBet(oneEther, 10))
                        .to.emit(sut, "LootTableUpdated")
                        .withArgs(config.stagedLootTable.target);
                });

                it("Should remove the staged loot table", async function () {
                    const { sut } = await loadFixture(stagedLootTableFixture);

                    await sut.placeBet(oneEther, 10);

                    expect(await sut.getStagedLootTable()).to.equal(ethers.ZeroAddress);
                });
            });

            it("Should set the round start block", async function () {
                const { sut, config } = await loadFixture(liquidFixture);

                await sut.placeBet(oneEther, 10);
                const currentBlock = await ethers.provider.getBlockNumber();

                const roundInfo = await sut.getRoundInfo();
                expect(roundInfo[1]).to.equal(currentBlock + config.introBlocks);
            });

            it("Should emit RoundStarted", async function () {
                const { sut, config } = await loadFixture(liquidFixture);

                const previous = await ethers.provider.getBlockNumber();
                const expectedStartBlock = previous + 1 + config.introBlocks; // +1 because event is emitted during the next block

                await expect(sut.placeBet(oneEther, 10))
                    .to.emit(sut, "RoundStarted")
                    .withArgs(config.genesisHash, expectedStartBlock, 0);
            });
        });

        it("Should revert if the round has already started", async function () {
            const { sut, config } = await loadFixture(liquidFixture);

            await sut.placeBet(oneEther, 10);

            await mine(config.introBlocks);

            await expect(sut.placeBet(oneEther, 10)).to.be.revertedWithCustomError(sut, "RoundInProgressError");
        });

        it("Should revert if the cashout index is outside of the loot table", async function () {
            const { sut, lootTable } = await loadFixture(liquidFixture);

            const length = await lootTable.getLength();

            await expect(sut.placeBet(oneEther, length + 1n)).to.be.revertedWithCustomError(
                sut,
                "InvalidCashoutIndexError"
            );
        });

        it("Should escrow the value", async function () {
            const { sut, token, wallets } = await loadFixture(liquidFixture);

            const initialBalance = await token.balanceOf(wallets.deployer.address);
            const initialContractBalance = await token.balanceOf(sut.target);

            await sut.placeBet(oneEther, 10);

            expect(await token.balanceOf(wallets.deployer.address)).to.equal(initialBalance - oneEther);
            expect(await token.balanceOf(sut.target)).to.equal(initialContractBalance + oneEther);
        });

        it("Should revert if there is insufficient liquidity", async function () {
            const { sut } = await loadFixture(tokenBalanceFixture);

            await expect(sut.placeBet(oneEther, 10)).to.be.revertedWithCustomError(sut, "InsufficientLiquidity");
        });

        it("Should reduce the round liquidity", async function () {
            const { sut, lootTable } = await loadFixture(liquidFixture);

            const cashout = 10;

            const maxWin = await lootTable.multiply(oneEther, cashout);

            const initialInfo = await sut.getRoundInfo();

            await sut.placeBet(oneEther, cashout);

            const roundInfo = await sut.getRoundInfo();

            expect(roundInfo[2]).to.equal(initialInfo[2] - maxWin);
        });

        it("Should store the bet", async function () {
            const { sut, wallets } = await loadFixture(liquidFixture);

            const cashoutIndex = 10;

            await sut.placeBet(oneEther, cashoutIndex);

            const bets = await sut.getBetsFor(wallets.deployer.address);

            expect(bets.length).to.equal(1);
            expect(bets[0].user).to.equal(wallets.deployer.address);
            expect(bets[0].amount).to.equal(oneEther);
            expect(bets[0].cashoutIndex).to.equal(cashoutIndex);
            expect(bets[0].cancelled).to.equal(false);
        });

        it("Should emit BetPlaced", async function () {
            const { sut, wallets, config } = await loadFixture(liquidFixture);

            let betIndex = 0;
            let cashoutIndex = 10;

            await expect(sut.placeBet(oneEther, cashoutIndex))
                .to.emit(sut, "BetPlaced")
                .withArgs(config.genesisHash, betIndex, wallets.deployer.address, oneEther, cashoutIndex);

            betIndex++;
            cashoutIndex = 9;

            await expect(sut.placeBet(oneEther, cashoutIndex))
                .to.emit(sut, "BetPlaced")
                .withArgs(config.genesisHash, betIndex, wallets.deployer.address, oneEther, cashoutIndex);
        });
    });

    describe("updateBet", function () {
        it("Should revert if the index is out of range", async function () {
            const { sut, config } = await loadFixture(betFixture);

            await expect(sut.updateBet(config.bets.length, 10)).to.be.revertedWithCustomError(sut, "BetNotFoundError");
        });

        it("Should revert if the caller does not own the bet", async function () {
            const { sut, wallets } = await loadFixture(betFixture);

            await expect(sut.connect(wallets.charlie).updateBet(0, 10)).to.be.revertedWithCustomError(
                sut,
                "BetNotYoursError"
            );
        });

        it("Should revert if the bet is cancelled", async function () {
            const { sut } = await loadFixture(betFixture);

            await sut.cancelBet(0);

            await expect(sut.updateBet(0, 10)).to.be.revertedWithCustomError(sut, "BetCancelledError");
        });

        it("Should revert if the round is in progress", async function () {
            const { sut, config } = await loadFixture(betFixture);

            await mine(config.introBlocks);

            await expect(sut.updateBet(0, 10)).to.be.revertedWithCustomError(sut, "RoundInProgressError");
        });

        it("Should revert if the cashout index is out of range", async function () {
            const { sut, lootTable } = await loadFixture(betFixture);

            await expect(sut.updateBet(0, (await lootTable.getLength()) + 1n)).to.be.revertedWithCustomError(
                sut,
                "InvalidCashoutIndexError"
            );
        });

        it("Should use the correct amount of round liquidity", async function () {
            const { sut, lootTable, config } = await loadFixture(betFixture);

            const initialRoundLiquidity = (await sut.getRoundInfo())[2];
            const initialLiquidity = await lootTable.multiply(config.bets[0].amount, config.bets[0].cashoutIndex);

            const newCashoutIndex = config.bets[0].cashoutIndex - 1;

            await sut.updateBet(0, newCashoutIndex);

            const newRoundLiquidity = (await sut.getRoundInfo())[2];
            const newLiquidity = await lootTable.multiply(config.bets[0].amount, newCashoutIndex);

            expect(newRoundLiquidity).to.equal(initialRoundLiquidity + initialLiquidity - newLiquidity);
        });

        it("Should revert if there is no longer enough liquidity", async function () {
            const { sut, lootTable } = await loadFixture(betFixture);

            const length = await lootTable.getLength();

            for (let i = 0; i < 8; i++) {
                await sut.placeBet(oneEther, length - 1n);
            }

            await expect(sut.updateBet(0, length - 1n)).to.be.revertedWithCustomError(sut, "InsufficientLiquidity");
        });

        it("Should update the cashout index", async function () {
            const { sut, wallets, config } = await loadFixture(betFixture);

            const newCashoutIndex = config.bets[0].cashoutIndex - 1;
            await sut.updateBet(0, newCashoutIndex);

            const bets = await sut.getBetsFor(wallets.deployer.address);
            expect(bets[0].cashoutIndex).to.equal(newCashoutIndex);
        });

        it("Should emit BetCashoutUpdated", async function () {
            const { sut, config } = await loadFixture(betFixture);

            const newCashoutIndex = config.bets[0].cashoutIndex - 1;

            await expect(sut.updateBet(0, newCashoutIndex))
                .to.emit(sut, "BetCashoutUpdated")
                .withArgs(config.genesisHash, 0, newCashoutIndex);
        });
    });

    describe("cancelBet", function () {
        it("Should revert if the index is out of range", async function () {
            const { sut, config } = await loadFixture(betFixture);

            await expect(sut.cancelBet(config.bets.length)).to.be.revertedWithCustomError(sut, "BetNotFoundError");
        });

        it("Should revert if the caller does not own the bet", async function () {
            const { sut, wallets } = await loadFixture(betFixture);

            await expect(sut.connect(wallets.charlie).cancelBet(0)).to.be.revertedWithCustomError(
                sut,
                "BetNotYoursError"
            );
        });

        it("Should revert if the bet is cancelled", async function () {
            const { sut } = await loadFixture(betFixture);

            await sut.cancelBet(0);

            await expect(sut.cancelBet(0)).to.be.revertedWithCustomError(sut, "BetCancelledError");
        });

        it("Should revert if the round is in progress", async function () {
            const { sut, config } = await loadFixture(betFixture);

            await mine(config.introBlocks);

            await expect(sut.cancelBet(0)).to.be.revertedWithCustomError(sut, "RoundInProgressError");
        });

        it("Should set cancelled to true", async function () {
            const { sut, wallets } = await loadFixture(betFixture);

            const betsBefore = await sut.getBetsFor(wallets.deployer.address);
            expect(betsBefore[0].cancelled).to.equal(false);

            await sut.cancelBet(0);

            const betsAfter = await sut.getBetsFor(wallets.deployer.address);
            expect(betsAfter[0].cancelled).to.equal(true);
        });

        it("Should refund the value minus a fee", async function () {
            const { sut, token, wallets, config } = await loadFixture(betFixture);

            const initialBalance = await token.balanceOf(wallets.deployer.address);
            const initialContractBalance = await token.balanceOf(sut.target);

            const refunded = (oneEther * config.cancelReturnNumerator) / 10000n;

            await sut.cancelBet(0);

            expect(await token.balanceOf(wallets.deployer.address)).to.equal(initialBalance + refunded);
            expect(await token.balanceOf(sut.target)).to.equal(initialContractBalance - refunded);
        });

        it("Should release the round liquidity", async function () {
            const { sut, lootTable, config } = await loadFixture(betFixture);

            const initialRoundLiquidity = (await sut.getRoundInfo())[2];
            const initialLiquidity = await lootTable.multiply(config.bets[0].amount, config.bets[0].cashoutIndex);

            await sut.cancelBet(0);

            const newRoundLiquidity = (await sut.getRoundInfo())[2];

            expect(newRoundLiquidity).to.equal(initialRoundLiquidity + initialLiquidity);
        });

        it("Should emit BetCancelled", async function () {
            const { sut, config } = await loadFixture(betFixture);

            await expect(sut.cancelBet(0)).to.emit(sut, "BetCancelled").withArgs(config.genesisHash, 0);
        });
    });

    describe("cashout", function () {
        it("Should revert if the index is out of range", async function () {
            const { sut, config } = await loadFixture(betFixture);

            await mine(config.introBlocks);

            await expect(sut.cashout(config.bets.length)).to.be.revertedWithCustomError(sut, "BetNotFoundError");
        });

        it("Should revert if the caller does not own the bet", async function () {
            const { sut, wallets, config } = await loadFixture(betFixture);

            await mine(config.introBlocks);

            await expect(sut.connect(wallets.charlie).cashout(0)).to.be.revertedWithCustomError(
                sut,
                "BetNotYoursError"
            );
        });

        it("Should revert if the bet is cancelled", async function () {
            const { sut, config } = await loadFixture(betFixture);

            await sut.cancelBet(0);

            await mine(config.introBlocks);

            await expect(sut.cashout(0)).to.be.revertedWithCustomError(sut, "BetCancelledError");
        });

        it("Should revert if the round has not started yet", async function () {
            const { sut } = await loadFixture(betFixture);

            await expect(sut.cashout(0)).to.be.revertedWithCustomError(sut, "RoundNotStartedError");
        });

        it("Should revert if the cashout index has already passed", async function () {
            const { sut, config } = await loadFixture(betFixture);

            await mine(config.introBlocks + config.bets[0].cashoutIndex + 1);

            await expect(sut.cashout(0)).to.be.revertedWithCustomError(sut, "InvalidCashoutIndexError");
        });

        it("Should update the cashout index", async function () {
            const { sut, wallets, config } = await loadFixture(betFixture);

            await mine(config.introBlocks);

            await mine(config.bets[0].cashoutIndex - 3);

            await sut.cashout(0);

            const updatedBets = await sut.getBetsFor(wallets.deployer.address);
            expect(updatedBets[0].cashoutIndex).to.equal(config.bets[0].cashoutIndex - 3);
        });

        it("Should emit BetCashoutUpdated", async function () {
            const { sut, config } = await loadFixture(betFixture);

            await mine(config.introBlocks);

            await mine(config.bets[0].cashoutIndex - 3);

            await expect(sut.cashout(0))
                .to.emit(sut, "BetCashoutUpdated")
                .withArgs(config.genesisHash, 0, config.bets[0].cashoutIndex - 3);
        });
    });

    describe("reveal", function () {
        const nextHash = ethers.hexlify(ethers.randomBytes(32));

        it("Should revert if the caller is not the hash producer", async function () {
            const { sut, wallets, config } = await loadFixture(completedBetFixture);

            await expect(sut.connect(wallets.alice).reveal(config.genesisSalt, nextHash)).to.be.revertedWithCustomError(
                sut,
                "NotHashProducerError"
            );
        });

        it("Should revert if the hash does not match the salt", async function () {
            const { sut } = await loadFixture(baseFixture);

            await expect(sut.reveal(ethers.hexlify(ethers.randomBytes(32)), nextHash)).to.be.revertedWithCustomError(
                sut,
                "InvalidHashError"
            );
        });

        it("Should revert if this function was called too early", async function () {
            const { sut, lootTable, config } = await loadFixture(betFixture);

            await expect(sut.reveal(config.genesisSalt, nextHash)).to.be.revertedWithCustomError(
                lootTable,
                "MissingBlockhashError"
            );
        });

        it("Should get the expected dead index", async function () {
            const { sut, config } = await loadFixture(completedBetFixture);

            await expect(sut.reveal(config.genesisSalt, nextHash))
                .to.emit(sut, "RoundEnded")
                .withArgs(config.genesisHash, config.genesisSalt, config.deadIndex);
        });

        it("Should payout winning bets", async function () {
            const { sut, lootTable, token, config } = await loadFixture(predictableDeathTable);

            const length = Number(await lootTable.getLength());

            await mine(config.introBlocks + length + 1);

            const info = await sut.getRoundInfo();
            const deadIndex = await lootTable.getDeadIndex(config.genesisSalt, info[1]);

            const sutBalanceBefore = await token.balanceOf(sut.target);
            const beforeBalances = await Promise.all(config.bets.map((b) => token.balanceOf(b.wallet.address)));

            await sut.reveal(config.genesisSalt, nextHash);

            const sutBalanceAfter = await token.balanceOf(sut.target);
            const afterBalances = await Promise.all(config.bets.map((b) => token.balanceOf(b.wallet.address)));

            let sum = 0n;
            for (let i = 0; i < deadIndex; i++) {
                const expectedWin = await lootTable.multiply(config.bets[i].amount, config.bets[i].cashoutIndex);
                expect(afterBalances[i]).to.equal(beforeBalances[i] + expectedWin);
                sum += expectedWin;
            }

            expect(sutBalanceAfter).to.equal(sutBalanceBefore - sum);
        });

        it("Should payout winning bets when there is no dead block", async function () {
            const { sut, lootTable, token, config } = await loadFixture(noDeathTable);

            const length = Number(await lootTable.getLength());

            await mine(config.introBlocks + length + 1);

            const info = await sut.getRoundInfo();
            const deadIndex = await lootTable.getDeadIndex(config.genesisSalt, info[1]);

            expect(deadIndex).to.equal(length);

            const sutBalanceBefore = await token.balanceOf(sut.target);
            const beforeBalances = await Promise.all(config.bets.map((b) => token.balanceOf(b.wallet.address)));

            await sut.reveal(config.genesisSalt, nextHash);

            const sutBalanceAfter = await token.balanceOf(sut.target);
            const afterBalances = await Promise.all(config.bets.map((b) => token.balanceOf(b.wallet.address)));

            let sum = 0n;
            for (let i = 0; i < deadIndex; i++) {
                const expectedWin = await lootTable.multiply(config.bets[i].amount, config.bets[i].cashoutIndex);
                expect(afterBalances[i]).to.equal(beforeBalances[i] + expectedWin);
                sum += expectedWin;
            }

            expect(sutBalanceAfter).to.equal(sutBalanceBefore - sum);
        });

        it("Should ignore cancelled bets", async function () {
            const { sut, lootTable, token, config } = await loadFixture(predictableDeathTable);

            const cancelToExc = 2;
            const length = Number(await lootTable.getLength());

            for (let i = 0; i < cancelToExc; i++) {
                await sut.connect(config.bets[i].wallet).cancelBet(i);
            }

            await mine(config.introBlocks + length - cancelToExc + 1);

            const info = await sut.getRoundInfo();
            const deadIndex = await lootTable.getDeadIndex(config.genesisSalt, info[1]);

            const sutBalanceBefore = await token.balanceOf(sut.target);
            const beforeBalances = await Promise.all(config.bets.map((b) => token.balanceOf(b.wallet.address)));

            await sut.reveal(config.genesisSalt, nextHash);

            const sutBalanceAfter = await token.balanceOf(sut.target);
            const afterBalances = await Promise.all(config.bets.map((b) => token.balanceOf(b.wallet.address)));

            let sum = 0n;
            for (let i = cancelToExc; i < deadIndex; i++) {
                const expectedWin = await lootTable.multiply(config.bets[i].amount, config.bets[i].cashoutIndex);
                expect(afterBalances[i]).to.equal(beforeBalances[i] + expectedWin);
                sum += expectedWin;
            }

            expect(sutBalanceAfter).to.equal(sutBalanceBefore - sum);
        });

        it("Should ignore dead bets", async function () {
            const { sut, lootTable, token, config } = await loadFixture(predictableDeathTable);

            const length = Number(await lootTable.getLength());

            await mine(config.introBlocks + length + 1);

            const info = await sut.getRoundInfo();
            const deadIndex = Number(await lootTable.getDeadIndex(config.genesisSalt, info[1]));

            const beforeBalances = await Promise.all(config.bets.map((b) => token.balanceOf(b.wallet.address)));

            await sut.reveal(config.genesisSalt, nextHash);

            const afterBalances = await Promise.all(config.bets.map((b) => token.balanceOf(b.wallet.address)));

            for (let i = deadIndex; i < config.bets.length; i++) {
                expect(afterBalances[i]).to.equal(beforeBalances[i]);
            }
        });

        it("Should clear the bets", async function () {
            const { sut, config } = await loadFixture(completedBetFixture);

            const info = await sut.getRoundInfo();
            expect(info[4].length).to.equal(config.bets.length);

            await sut.reveal(config.genesisSalt, nextHash);

            const newInfo = await sut.getRoundInfo();
            expect(newInfo[4].length).to.equal(0);
        });

        it("Should clear the liquidity queue", async function () {
            const { sut, config } = await loadFixture(completedBetFixture);

            await sut.deposit(oneEther);
            await sut.withdraw(oneEther);

            const liquidityQueue = await sut.getLiquidityQueue();
            expect(liquidityQueue.length).to.equal(2);

            await sut.reveal(config.genesisSalt, nextHash);

            const newLiquidityQueue = await sut.getLiquidityQueue();
            expect(newLiquidityQueue.length).to.equal(0);
        });

        it("Should emit RoundEnded", async function () {
            const { sut, config } = await loadFixture(completedBetFixture);

            await expect(sut.reveal(config.genesisSalt, nextHash))
                .to.emit(sut, "RoundEnded")
                .withArgs(config.genesisHash, config.genesisSalt, config.deadIndex);
        });

        it("Should reset the round start block", async function () {
            const { sut, config } = await loadFixture(completedBetFixture);

            await sut.reveal(config.genesisSalt, nextHash);

            const roundInfo = await sut.getRoundInfo();
            expect(roundInfo[1]).to.equal(0);
        });

        it("Should set the new round hash", async function () {
            const { sut, config } = await loadFixture(completedBetFixture);

            await sut.reveal(config.genesisSalt, nextHash);

            const roundInfo = await sut.getRoundInfo();
            expect(roundInfo[3]).to.equal(nextHash);
        });

        it("Should increment the hashIndex", async function () {
            const { sut, config } = await loadFixture(completedBetFixture);

            const previous = (await sut.getRoundInfo())[0];

            await sut.reveal(config.genesisSalt, nextHash);

            expect((await sut.getRoundInfo())[0]).to.equal(previous + 1n);
        });
    });

    describe("refund", function () {
        const nextHash = ethers.hexlify(ethers.randomBytes(32));

        it("Should revert if the caller is not the hash producer", async function () {
            const { sut, wallets, config } = await loadFixture(unrecoverableRoundFixture);

            await expect(sut.connect(wallets.alice).refund(config.genesisSalt, nextHash)).to.be.revertedWithCustomError(
                sut,
                "NotHashProducerError"
            );
        });

        it("Should revert if the hash does not match the salt", async function () {
            const { sut } = await loadFixture(unrecoverableRoundFixture);

            await expect(sut.refund(ethers.hexlify(ethers.randomBytes(32)), nextHash)).to.be.revertedWithCustomError(
                sut,
                "InvalidHashError"
            );
        });

        it("Should revert if the round has not started yet", async function () {
            const { sut, config } = await loadFixture(baseFixture);

            await expect(sut.refund(config.genesisSalt, nextHash)).to.be.revertedWithCustomError(
                sut,
                "RoundNotRefundableError"
            );
        });

        it("Should revert if the round can still be revealed", async function () {
            const { sut, config } = await loadFixture(completedBetFixture);

            await expect(sut.refund(config.genesisSalt, nextHash)).to.be.revertedWithCustomError(
                sut,
                "RoundNotRefundableError"
            );
        });

        it("Should refund non-cancelled bets", async function () {
            const { sut, token, config } = await loadFixture(predictableDeathTable);

            await mine(1000);

            const sutBalanceBefore = await token.balanceOf(sut.target);
            const beforeBalances = await Promise.all(config.bets.map((b) => token.balanceOf(b.wallet.address)));

            await sut.refund(config.genesisSalt, nextHash);

            let sum = 0n;
            for (let i = 0; i < config.bets.length; i++) {
                expect(await token.balanceOf(config.bets[i].wallet.address)).to.equal(
                    beforeBalances[i] + config.bets[i].amount
                );
                sum += config.bets[i].amount;
            }

            expect(await token.balanceOf(sut.target)).to.equal(sutBalanceBefore - sum);
        });

        it("Should ignore cancelled bets", async function () {
            const { sut, token, config } = await loadFixture(predictableDeathTable);

            const cancelToExc = 2;

            for (let i = 0; i < cancelToExc; i++) {
                await sut.connect(config.bets[i].wallet).cancelBet(i);
            }

            await mine(1000);

            const sutBalanceBefore = await token.balanceOf(sut.target);
            const beforeBalances = await Promise.all(config.bets.map((b) => token.balanceOf(b.wallet.address)));

            await sut.refund(config.genesisSalt, nextHash);

            let sum = 0n;
            for (let i = cancelToExc; i < config.bets.length; i++) {
                expect(await token.balanceOf(config.bets[i].wallet.address)).to.equal(
                    beforeBalances[i] + config.bets[i].amount
                );
                sum += config.bets[i].amount;
            }

            expect(await token.balanceOf(sut.target)).to.equal(sutBalanceBefore - sum);
        });

        it("Should clear the bets", async function () {
            const { sut, config } = await loadFixture(unrecoverableRoundFixture);

            const info = await sut.getRoundInfo();
            expect(info[4].length).to.equal(config.bets.length);

            await sut.refund(config.genesisSalt, nextHash);

            const newInfo = await sut.getRoundInfo();
            expect(newInfo[4].length).to.equal(0);
        });

        it("Should clear the liquidity queue", async function () {
            const { sut, config } = await loadFixture(unrecoverableRoundFixture);

            await sut.deposit(oneEther);
            await sut.withdraw(oneEther);

            const liquidityQueue = await sut.getLiquidityQueue();
            expect(liquidityQueue.length).to.equal(2);

            await sut.refund(config.genesisSalt, nextHash);

            const newLiquidityQueue = await sut.getLiquidityQueue();
            expect(newLiquidityQueue.length).to.equal(0);
        });

        it("Should emit RoundRefunded", async function () {
            const { sut, config } = await loadFixture(unrecoverableRoundFixture);

            await expect(sut.refund(config.genesisSalt, nextHash))
                .to.emit(sut, "RoundRefunded")
                .withArgs(config.genesisHash, config.genesisSalt);
        });

        it("Should reset the round start block", async function () {
            const { sut, config } = await loadFixture(unrecoverableRoundFixture);

            await sut.refund(config.genesisSalt, nextHash);

            const roundInfo = await sut.getRoundInfo();
            expect(roundInfo[1]).to.equal(0);
        });

        it("Should set the new round hash", async function () {
            const { sut, config } = await loadFixture(unrecoverableRoundFixture);

            await sut.refund(config.genesisSalt, nextHash);

            const roundInfo = await sut.getRoundInfo();
            expect(roundInfo[3]).to.equal(nextHash);
        });

        it("Should increment the hashIndex", async function () {
            const { sut, config } = await loadFixture(unrecoverableRoundFixture);

            const previous = (await sut.getRoundInfo())[0];

            await sut.refund(config.genesisSalt, nextHash);

            expect((await sut.getRoundInfo())[0]).to.equal(previous + 1n);
        });
    });

    describe("_onLowLiquidity", function () {
        it("Should do nothing if the start block is zero", async function () {
            const { sut } = await loadFixture(liquidFixture);

            const roundInfo = await sut.getRoundInfo();
            expect(roundInfo[1]).to.equal(0);

            await sut.callOnLowLiquidity();

            const newRoundInfo = await sut.getRoundInfo();
            expect(newRoundInfo[1]).to.equal(0);
        });

        it("Should do nothing if the start block is already below the reduced value", async function () {
            const { sut, config } = await loadFixture(liquidFixture);

            await sut.placeBet(oneEther, 10);
            const startblock = (await ethers.provider.getBlockNumber()) + config.introBlocks;

            await mine(config.introBlocks - config.reducedIntroBlocks);

            const roundInfo = await sut.getRoundInfo();
            expect(roundInfo[1]).to.equal(startblock);

            await sut.callOnLowLiquidity();

            const newRoundInfo = await sut.getRoundInfo();
            expect(newRoundInfo[1]).to.equal(startblock);
        });

        it("Should set the round start block to the new reduced value", async function () {
            const { sut, config } = await loadFixture(liquidFixture);

            await sut.placeBet(oneEther, 10);
            const startblock = (await ethers.provider.getBlockNumber()) + config.introBlocks;

            const roundInfo = await sut.getRoundInfo();
            expect(roundInfo[1]).to.equal(startblock);

            await sut.callOnLowLiquidity();
            const newStartBlock = (await ethers.provider.getBlockNumber()) + config.reducedIntroBlocks;

            const newRoundInfo = await sut.getRoundInfo();
            expect(newRoundInfo[1]).to.equal(newStartBlock);
        });

        it("Should emit RoundAccelerated", async function () {
            const { sut, config } = await loadFixture(liquidFixture);

            await sut.placeBet(oneEther, 10);

            const previousBlockNumber = await ethers.provider.getBlockNumber();
            await expect(sut.callOnLowLiquidity())
                .to.emit(sut, "RoundAccelerated")
                .withArgs(config.genesisHash, previousBlockNumber + 1 + config.reducedIntroBlocks);
        });
    });
});
