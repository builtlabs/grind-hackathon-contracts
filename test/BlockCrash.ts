import { loadFixture, mine } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

const oneEther = ethers.parseEther("1");
const initialBalance = ethers.parseEther("100");

describe("BlockCrash", function () {
    async function deployFixture() {
        const [deployer, alice, bob, charlie] = await ethers.getSigners();

        const GRIND = await ethers.getContractFactory("Grind");
        const grind = await GRIND.deploy();
        await grind.waitForDeployment();

        const BLOCKCRASH = await ethers.getContractFactory("BlockCrashHarness");
        const sut = await BLOCKCRASH.deploy(grind.target, deployer.address);

        for (const wallet of [alice, bob, charlie]) {
            await grind.mint(wallet.address);
        }

        return {
            sut,
            grind,
            wallets: {
                deployer,
                alice,
                bob,
                charlie,
            },
        };
    }

    // ############################ TESTS ############################

    describe.skip("Integration", function () {
        it("Should produce the expected tally", async function () {
            const { sut, grind, wallets } = await loadFixture(deployFixture);

            await grind.mint(wallets.deployer.address);
            await grind.mint(wallets.deployer.address);
            await grind.approve(sut.target, initialBalance * 2n);

            await sut.queueLiquidityChange(0, initialBalance);

            await sut.reset();

            const multipliers = [
                500000, 750000, 1000000, 1250000, 1500000, 2000000, 2500000, 3000000, 4000000, 5000000, 6000000,
                7000000, 9000000, 10000000, 12500000, 15000000, 17500000, 20000000, 22500000, 25000000, 27500000,
                30000000, 32500000, 35000000, 37500000, 40000000, 42500000, 45000000, 47500000, 50000000, 52500000,
                55000000, 57500000, 60000000, 62500000, 65000000, 67500000, 70000000, 72500000, 75000000, 77500000,
                80000000, 82500000, 85000000, 87500000, 90000000, 92500000, 95000000, 97500000, 100000000,
            ];

            const total = 10000;
            const tally: Record<number, number> = {};

            for (let i = 0; i < total; i++) {
                await sut.placeBet(ethers.parseEther("0.01"), 49n);

                await mine(100);

                await sut.reset();
            }

            const history = await sut.getHistory(0, total);

            for (const multi of history) {
                const keyIndex = multipliers.findIndex((x) => x === parseFloat(multi.toString()));

                for (let i = 0; i <= keyIndex; i++) {
                    tally[multipliers[i]] = (tally[multipliers[i]] || 0) + 1;
                }
            }

            for (const entries of Object.entries(tally)) {
                const [key, value] = entries;

                const multi = parseFloat(key) / 1e6;
                const ev = (value / total) * multi;

                if (multi >= 1) {
                    expect(ev).to.be.closeTo(0.97, 0.1);
                } else {
                    expect(ev).to.be.lessThan(0.97);
                }

                console.log("ev", multi, (value / total) * multi);
            }
        });
    });

    describe("placeBet", function () {
        async function betFixture() {
            const fixture = await deployFixture();
            const { sut, grind, wallets } = fixture;

            for (const wallet of [wallets.alice, wallets.bob, wallets.charlie]) {
                await grind.connect(wallet).approve(sut.target, initialBalance);
            }

            await grind.mint(wallets.deployer.address);
            await grind.approve(sut.target, initialBalance);

            await sut.queueLiquidityChange(0, initialBalance);
            await sut.reset();

            return fixture;
        }

        it("Should revert if the amount is 0", async function () {
            const { sut } = await loadFixture(betFixture);

            await expect(sut.placeBet(0, 0)).to.be.revertedWithCustomError(sut, "ZeroAmountError");
        });

        it("Should start the game if _roundStartBlock is 0", async function () {
            const { sut, wallets } = await loadFixture(betFixture);

            const block = await ethers.provider.getBlock("latest");
            const offset = await sut.ROUND_BUFFER();

            await sut.connect(wallets.alice).placeBet(oneEther, 4);

            const game = await sut.getRoundInfo();

            expect(game.sb).to.equal(BigInt(block!.number) + offset + 1n);
        });

        it("Should revert if the autoCashout is above the max allowed limit", async function () {
            const { sut, wallets } = await loadFixture(betFixture);

            const length = await sut.ROUND_LENGTH();

            await expect(sut.connect(wallets.alice).placeBet(oneEther, length)).to.be.revertedWithCustomError(
                sut,
                "InvalidCashoutError"
            );
        });

        it("Should revert if the block is the start block", async function () {
            const { sut, wallets } = await loadFixture(betFixture);

            const offset = await sut.ROUND_BUFFER();

            await sut.connect(wallets.alice).placeBet(oneEther, 4);
            await mine(offset - 1n);

            const block = await ethers.provider.getBlock("latest");
            expect(BigInt(block!.number)).to.equal((await sut.getRoundInfo()).sb - 1n);

            await expect(sut.connect(wallets.bob).placeBet(oneEther, 4)).to.be.revertedWithCustomError(
                sut,
                "BetsClosedError"
            );
        });

        it("Should revert if the block is greater than the start block", async function () {
            const { sut, wallets } = await loadFixture(betFixture);

            const offset = await sut.ROUND_BUFFER();

            await sut.connect(wallets.alice).placeBet(oneEther, 4);
            await mine(offset);

            const block = await ethers.provider.getBlock("latest");
            expect(BigInt(block!.number)).to.equal((await sut.getRoundInfo()).sb);

            await expect(sut.connect(wallets.bob).placeBet(oneEther, 4)).to.be.revertedWithCustomError(
                sut,
                "BetsClosedError"
            );
        });

        it("Should take hold of the funds", async function () {
            const { sut, grind, wallets } = await loadFixture(betFixture);

            const sutBefore = await grind.balanceOf(sut.target);
            const aliceBefore = await grind.balanceOf(wallets.alice.address);

            await sut.connect(wallets.alice).placeBet(oneEther, 4);

            const sutAfter = await grind.balanceOf(sut.target);
            const aliceAfter = await grind.balanceOf(wallets.alice.address);

            expect(sutAfter).to.equal(sutBefore + oneEther);
            expect(aliceAfter).to.equal(aliceBefore - oneEther);
        });        
        
        it("Should not revert if the max possible win is the round lq", async function () {
            const { sut,wallets } = await loadFixture(betFixture);

            await expect(sut.connect(wallets.alice).placeBet(oneEther, 25))
                .to.not.be.revertedWithCustomError(sut, "BetTooLargeError");
        });

        it("Should revert if the max possible win is greater than the round lq", async function () {
            const { sut,wallets } = await loadFixture(betFixture);

            await expect(sut.connect(wallets.alice).placeBet(oneEther, 26))
                .to.be.revertedWithCustomError(sut, "BetTooLargeError");
        });

        it("Should decrement the round lq", async function () {
            const { sut, wallets } = await loadFixture(betFixture);

            const before = await sut.getRoundInfo();

            await sut.connect(wallets.alice).placeBet(oneEther, 5); // 2x

            const after = await sut.getRoundInfo();

            expect(after.lq).to.equal(before.lq - oneEther * 2n);
        });

        it("Should store the bet", async function () {
            const { sut, wallets } = await loadFixture(betFixture);

            await sut.connect(wallets.alice).placeBet(oneEther, 4);

            const bets = await sut.getBets();
            const aliceBets = await sut.getBetsFor(wallets.alice.address);

            expect(bets.length).to.equal(1);
            expect(bets[0].user).to.equal(wallets.alice.address);
            expect(bets[0].amount).to.equal(oneEther);
            expect(bets[0].cashoutIndex).to.equal(4n);

            expect(aliceBets.length).to.equal(1);
            expect(aliceBets[0].user).to.equal(wallets.alice.address);
            expect(aliceBets[0].amount).to.equal(oneEther);
            expect(aliceBets[0].cashoutIndex).to.equal(4n);
        });
    });

    describe("cashEarly", function () {
        async function cashEarlyFixture() {
            const fixture = await deployFixture();
            const { sut, grind, wallets } = fixture;

            for (const wallet of [wallets.alice, wallets.bob, wallets.charlie]) {
                await grind.connect(wallet).approve(sut.target, initialBalance);
            }

            await grind.mint(wallets.deployer.address);
            await grind.approve(sut.target, initialBalance);

            await sut.queueLiquidityChange(0, initialBalance);
            await sut.reset();

            return fixture;
        }

        it("Should revert if the bet doesnt exist", async function () {
            const { sut } = await loadFixture(cashEarlyFixture);
        });

        it("Should revert if the bet isnt yours", async function () {
            const { sut } = await loadFixture(cashEarlyFixture);
        });

        it("Should revert if the game hasnt started yet", async function () {
            const { sut } = await loadFixture(cashEarlyFixture);
        });

        it("Should revert if the round is over", async function () {
            const { sut } = await loadFixture(cashEarlyFixture);
        });

        it("Should revert if the block is beyond the users cashout", async function () {
            const { sut } = await loadFixture(cashEarlyFixture);
        });

        it("Should update the cashoutIndex", async function () {
            const { sut } = await loadFixture(cashEarlyFixture);
        });
    });

    describe("queueLiquidityChange", function () {
        it("Should set the grind address", async function () {
            const { sut, grind } = await loadFixture(deployFixture);

            expect(await sut.GRIND()).to.equal(await grind.getAddress());
        });

        it("Should set the runner address", async function () {
            const { sut, wallets } = await loadFixture(deployFixture);

            expect(await sut.RUNNER()).to.equal(wallets.deployer.address);
        });
    });

    describe("queueLiquidityChange", function () {
        it("Should revert if the amount is zero", async function () {
            const { sut } = await loadFixture(deployFixture);

            await expect(sut.queueLiquidityChange(0, 0)).to.be.revertedWithCustomError(sut, "ZeroAmountError");
        });

        it("Should revert if the action is greater than 1", async function () {
            const { sut } = await loadFixture(deployFixture);

            await expect(sut.queueLiquidityChange(2, oneEther)).to.be.revertedWithCustomError(
                sut,
                "InvalidActionError"
            );
        });

        it("Should push to the LQ", async function () {
            const { sut, wallets } = await loadFixture(deployFixture);

            const tx = await sut.queueLiquidityChange(0, oneEther);
            await tx.wait();

            const lq = await sut.getLiquidityQueue();

            expect(lq.length).to.equal(1);
            expect(lq[0].user).to.equal(wallets.deployer.address);
            expect(lq[0].amount).to.equal(oneEther);
            expect(lq[0].action).to.equal(0);
        });

        it("Should emit the LiquidityChangeQueued event", async function () {
            const { sut, wallets } = await loadFixture(deployFixture);

            await expect(sut.queueLiquidityChange(0, oneEther))
                .to.emit(sut, "LiquidityChangeQueued")
                .withArgs(0, wallets.deployer.address, oneEther);
        });
    });

    describe("reset", function () {
        it("Should revert if the caller is not the runner", async function () {
            const { sut, wallets } = await loadFixture(deployFixture);

            await expect(sut.connect(wallets.alice).reset()).to.be.revertedWithCustomError(sut, "InvalidSenderError");
        });

        it("Should ignore an invalid add when the caller has no funds", async function () {
            const { sut, wallets } = await loadFixture(deployFixture);

            await sut.queueLiquidityChange(0, oneEther);
            await sut.reset();

            const lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(0);
            expect(await sut.getShares(wallets.deployer)).to.equal(0);
        });

        it("Should ignore an invalid add when the caller has no allowance", async function () {
            const { sut, wallets } = await loadFixture(deployFixture);

            await sut.connect(wallets.alice).queueLiquidityChange(0, oneEther);
            await sut.reset();

            const lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(0);
            expect(await sut.getShares(wallets.alice)).to.equal(0);
        });

        it("Should ignore an invalid remove", async function () {
            const { sut, wallets } = await loadFixture(deployFixture);

            await sut.queueLiquidityChange(1, oneEther);
            await sut.reset();

            const lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(0);
            expect(await sut.getShares(wallets.deployer)).to.equal(0);
        });

        it("Should add liquidity", async function () {
            const { sut, grind, wallets } = await loadFixture(deployFixture);

            await grind.connect(wallets.alice).approve(sut.target, oneEther);

            await sut.connect(wallets.alice).queueLiquidityChange(0, oneEther);
            await sut.reset();

            const lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(oneEther);
            expect(await sut.getShares(wallets.alice)).to.equal(oneEther);
            expect(await grind.balanceOf(wallets.alice.address)).to.equal(initialBalance - oneEther);
            expect(await grind.balanceOf(sut.target)).to.equal(oneEther);
        });

        it("Should remove liquidity", async function () {
            const { sut, grind, wallets } = await loadFixture(deployFixture);

            await grind.connect(wallets.alice).approve(sut.target, oneEther);

            await sut.connect(wallets.alice).queueLiquidityChange(0, oneEther);
            await sut.connect(wallets.alice).queueLiquidityChange(1, oneEther);
            await sut.reset();

            const lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(0);
            expect(await sut.getShares(wallets.alice)).to.equal(0);

            expect(await grind.balanceOf(wallets.alice.address)).to.equal(initialBalance);
            expect(await grind.balanceOf(sut.target)).to.equal(0);
        });

        it("Should add multiple", async function () {
            const { sut, grind, wallets } = await loadFixture(deployFixture);

            const adds = [wallets.alice, wallets.bob, wallets.charlie];

            for (const wallet of adds) {
                await grind.connect(wallet).approve(sut.target, oneEther);
                await sut.connect(wallet).queueLiquidityChange(0, oneEther);
            }

            await sut.reset();

            const lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(oneEther * BigInt(adds.length));
            expect(await grind.balanceOf(sut.target)).to.equal(oneEther * BigInt(adds.length));

            for (const wallet of adds) {
                expect(await sut.getShares(wallet)).to.equal(oneEther);
                expect(await grind.balanceOf(wallet.address)).to.equal(initialBalance - oneEther);
            }
        });

        it("Should remove multiple", async function () {
            const { sut, grind, wallets } = await loadFixture(deployFixture);

            const adds = [wallets.alice, wallets.bob, wallets.charlie];
            const removes = [wallets.alice, wallets.bob, wallets.charlie];

            for (const wallet of adds) {
                await grind.connect(wallet).approve(sut.target, oneEther);
                await sut.connect(wallet).queueLiquidityChange(0, oneEther);
            }

            for (const wallet of removes) {
                await sut.connect(wallet).queueLiquidityChange(1, oneEther);
            }

            await sut.reset();

            const lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(0);
            expect(await grind.balanceOf(sut.target)).to.equal(0);

            for (const wallet of removes) {
                expect(await sut.getShares(wallet)).to.equal(0);
                expect(await grind.balanceOf(wallet.address)).to.equal(initialBalance);
            }
        });

        it("Should behave well with multiple resets", async function () {
            const { sut, grind, wallets } = await loadFixture(deployFixture);

            let lq = await sut.getLiquidityQueue();

            await grind.connect(wallets.alice).approve(sut.target, initialBalance);
            await grind.connect(wallets.bob).approve(sut.target, initialBalance);
            await grind.connect(wallets.charlie).approve(sut.target, initialBalance);

            // ----------------------------------------------------------------------

            await sut.connect(wallets.alice).queueLiquidityChange(0, oneEther);
            await sut.connect(wallets.bob).queueLiquidityChange(0, oneEther);
            await sut.reset();

            lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(oneEther + oneEther);
            expect(await grind.balanceOf(sut.target)).to.equal(oneEther + oneEther);

            expect(await sut.getShares(wallets.alice)).to.equal(oneEther);
            expect(await grind.balanceOf(wallets.alice.address)).to.equal(initialBalance - oneEther);

            expect(await sut.getShares(wallets.bob)).to.equal(oneEther);
            expect(await grind.balanceOf(wallets.bob.address)).to.equal(initialBalance - oneEther);

            // ----------------------------------------------------------------------

            await sut.connect(wallets.bob).queueLiquidityChange(1, oneEther);
            await sut.connect(wallets.charlie).queueLiquidityChange(0, oneEther);
            await sut.reset();

            lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(oneEther + oneEther);
            expect(await grind.balanceOf(sut.target)).to.equal(oneEther + oneEther);

            expect(await sut.getShares(wallets.alice)).to.equal(oneEther);
            expect(await grind.balanceOf(wallets.alice.address)).to.equal(initialBalance - oneEther);

            expect(await sut.getShares(wallets.bob)).to.equal(0);
            expect(await grind.balanceOf(wallets.bob.address)).to.equal(initialBalance);

            expect(await sut.getShares(wallets.charlie)).to.equal(oneEther);
            expect(await grind.balanceOf(wallets.charlie.address)).to.equal(initialBalance - oneEther);

            // ----------------------------------------------------------------------

            await sut.connect(wallets.alice).queueLiquidityChange(1, oneEther);
            await sut.connect(wallets.charlie).queueLiquidityChange(1, oneEther);
            await sut.reset();

            lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(0);
            expect(await grind.balanceOf(sut.target)).to.equal(0);

            expect(await sut.getShares(wallets.alice)).to.equal(0);
            expect(await grind.balanceOf(wallets.alice.address)).to.equal(initialBalance);

            expect(await sut.getShares(wallets.bob)).to.equal(0);
            expect(await grind.balanceOf(wallets.bob.address)).to.equal(initialBalance);

            expect(await sut.getShares(wallets.charlie)).to.equal(0);
            expect(await grind.balanceOf(wallets.charlie.address)).to.equal(initialBalance);
        });

        it("Should allow for varied amounts", async function () {
            const { sut, grind, wallets } = await loadFixture(deployFixture);

            const users = [wallets.alice, wallets.bob, wallets.charlie];

            for (const wallet of users) {
                await grind.connect(wallet).approve(sut.target, initialBalance);
            }

            const queues = [
                [
                    { action: 0, wallet: wallets.alice, amount: oneEther },
                    { action: 0, wallet: wallets.bob, amount: oneEther * 2n },
                    { action: 0, wallet: wallets.alice, amount: oneEther },
                    { action: 1, wallet: wallets.bob, amount: oneEther },
                    { action: 0, wallet: wallets.charlie, amount: oneEther * 3n },
                    { action: 1, wallet: wallets.alice, amount: oneEther },
                ],
                [
                    { action: 1, wallet: wallets.bob, amount: oneEther },
                    { action: 0, wallet: wallets.alice, amount: oneEther },
                    { action: 1, wallet: wallets.charlie, amount: oneEther },
                ],
                [
                    { action: 1, wallet: wallets.alice, amount: oneEther },
                    { action: 1, wallet: wallets.charlie, amount: oneEther * 2n },
                    { action: 1, wallet: wallets.alice, amount: oneEther },
                ],
            ];

            for (const queue of queues) {
                for (const item of queue) {
                    await sut.connect(item.wallet).queueLiquidityChange(item.action, item.amount);
                }
                await sut.reset();
            }

            const lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(0);
            expect(await grind.balanceOf(sut.target)).to.equal(0);

            for (const wallet of users) {
                expect(await sut.getShares(wallet)).to.equal(0);
                expect(await grind.balanceOf(wallet.address)).to.equal(initialBalance);
            }
        });

        it("Should allow for added tokens", async function () {
            const { sut, grind, wallets } = await loadFixture(deployFixture);

            const adds = [
                { wallet: wallets.alice, amount: oneEther },
                { wallet: wallets.bob, amount: oneEther * 3n },
                { wallet: wallets.charlie, amount: oneEther * 6n },
            ];

            const share = initialBalance / 10n;
            const removes = [
                { wallet: wallets.alice, multiplier: 1n },
                { wallet: wallets.bob, multiplier: 3n },
                { wallet: wallets.charlie, multiplier: 6n },
            ];

            for (const add of adds) {
                await grind.connect(add.wallet).approve(sut.target, initialBalance);
                await sut.connect(add.wallet).queueLiquidityChange(0, add.amount);
            }

            await sut.reset();

            expect(await sut.getTotalShares()).to.equal(10n * oneEther);
            expect(await grind.balanceOf(sut.target)).to.equal(10n * oneEther);

            // MOCK game finishing to add new money into the pot.
            await grind.mint(sut.target); // 100 extra tokens, for 10 shares

            for (const remove of removes) {
                await sut.connect(remove.wallet).queueLiquidityChange(1, await sut.getShares(remove.wallet.address));
            }

            await sut.reset();

            const lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(0);
            expect(await grind.balanceOf(sut.target)).to.equal(0);

            for (const remove of removes) {
                expect(await sut.getShares(remove.wallet)).to.equal(0);
                expect(await grind.balanceOf(remove.wallet.address)).to.equal(
                    initialBalance + share * remove.multiplier
                );
            }
        });
    });
});
