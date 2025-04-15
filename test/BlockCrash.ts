import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
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

        const BLOCKCRASH = await ethers.getContractFactory("BlockCrash");
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

    describe("queueLiquidityChange", function () {
        it("Should set the grind address", async function () {
            const { sut, grind } = await loadFixture(deployFixture);

            expect(await sut.GRIND()).to.equal(await grind.getAddress());
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

    describe("", function () {
        it("Should ", async function () {
            const { sut } = await loadFixture(deployFixture);
        });

        it("Should ", async function () {
            const { sut } = await loadFixture(deployFixture);
        });

        it("Should ", async function () {
            const { sut } = await loadFixture(deployFixture);
        });
    });

    describe("", function () {
        it("Should ", async function () {
            const { sut } = await loadFixture(deployFixture);
        });

        it("Should ", async function () {
            const { sut } = await loadFixture(deployFixture);
        });

        it("Should ", async function () {
            const { sut } = await loadFixture(deployFixture);
        });
    });

    describe("", function () {
        it("Should ", async function () {
            const { sut } = await loadFixture(deployFixture);
        });

        it("Should ", async function () {
            const { sut } = await loadFixture(deployFixture);
        });

        it("Should ", async function () {
            const { sut } = await loadFixture(deployFixture);
        });
    });
});
