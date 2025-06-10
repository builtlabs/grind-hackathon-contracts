import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

const lowLiquidityThreshold = ethers.parseEther("0.1");
const oneEther = ethers.parseEther("1");

describe("Liquidity", function () {
    async function fixture() {
        const [deployer, alice, bob, charlie] = await ethers.getSigners();

        const TOKEN = await ethers.getContractFactory("MockERC20");
        const token = await TOKEN.deploy();
        await token.waitForDeployment();

        const SUT = await ethers.getContractFactory("LiquidityHarness");
        const sut = await SUT.deploy(lowLiquidityThreshold, token.target);

        return {
            sut,
            token,
            wallets: {
                deployer,
                alice,
                bob,
                charlie,
            },
        };
    }

    // ############################ TESTS ############################

    describe("constructor", function () {
        it("Should set _maxExposureNumerator to 1000 (10%)", async function () {
            const { sut } = await loadFixture(fixture);

            expect(await sut.getMaxExposureNumerator()).to.equal(1000);
        });

        it("Should set _lowLiquidityThreshold", async function () {
            const { sut } = await loadFixture(fixture);

            expect(await sut.getLowLiquidityThreshold()).to.equal(lowLiquidityThreshold);
        });
    });

    describe("setMaxExposure", function () {
        it("Should revert if the caller is not the owner", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            await expect(sut.connect(wallets.alice).setMaxExposure(1000))
                .to.be.revertedWithCustomError(sut, "OwnableUnauthorizedAccount")
                .withArgs(wallets.alice.address);
        });

        it("Should revert if the numerator is less than 100 (1%)", async function () {
            const { sut } = await loadFixture(fixture);

            await expect(sut.setMaxExposure(99)).to.be.revertedWithCustomError(sut, "InvalidMaxExposure");
        });

        it("Should revert if the numerator is greater than 5000 (50%)", async function () {
            const { sut } = await loadFixture(fixture);

            await expect(sut.setMaxExposure(5001)).to.be.revertedWithCustomError(sut, "InvalidMaxExposure");
        });

        it("Should set the numerator to the new value", async function () {
            const { sut } = await loadFixture(fixture);

            await sut.setMaxExposure(2000);

            expect(await sut.getMaxExposureNumerator()).to.equal(2000);
        });
    });

    describe("setLowLiquidityThreshold", function () {
        it("Should revert if the caller is not the owner", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            await expect(sut.connect(wallets.alice).setLowLiquidityThreshold(oneEther))
                .to.be.revertedWithCustomError(sut, "OwnableUnauthorizedAccount")
                .withArgs(wallets.alice.address);
        });

        it("Should set the low liquidity threshold value", async function () {
            const { sut } = await loadFixture(fixture);

            await sut.setLowLiquidityThreshold(oneEther);

            expect(await sut.getLowLiquidityThreshold()).to.equal(oneEther);
        });
    });

    describe("deposit", function () {
        it("Should revert if the value is 0", async function () {
            const { sut } = await loadFixture(fixture);

            await expect(sut.deposit(0)).to.be.revertedWithCustomError(sut, "InvalidValue");
        });

        it("Should receive the token value", async function () {
            const { sut, token, wallets } = await loadFixture(fixture);

            await token.mint(wallets.deployer.address, oneEther);
            await token.approve(sut.target, oneEther);
            await sut.deposit(oneEther);

            expect(await token.balanceOf(sut.target)).to.equal(oneEther);
        });

        it("Should revert if the receive fails", async function () {
            const { sut, token, wallets } = await loadFixture(fixture);

            await token.mint(wallets.deployer.address, oneEther);

            await expect(sut.deposit(oneEther))
                .to.revertedWithCustomError(token, "ERC20InsufficientAllowance")
                .withArgs(sut.target, 0, oneEther);
        });

        describe("_canChangeLiquidity() == true", function () {
            it("Should set accurate shares for the first deposit", async function () {
                const { sut, token, wallets } = await loadFixture(fixture);

                await token.mint(wallets.deployer.address, oneEther);
                await token.approve(sut.target, oneEther);

                await sut.mockCanChangeLiquidity(true);

                await sut.deposit(oneEther);

                expect(await sut.getShares(wallets.deployer.address)).to.equal(oneEther);
                expect(await sut.getTotalShares()).to.equal(oneEther);
            });

            it("Should set accurate shares for the second deposit", async function () {
                const { sut, token, wallets } = await loadFixture(fixture);

                await token.mint(wallets.deployer.address, oneEther);
                await token.approve(sut.target, oneEther);

                await sut.mockCanChangeLiquidity(true);

                await sut.deposit(oneEther / 4n);
                await sut.deposit((oneEther / 4n) * 3n);

                expect(await sut.getShares(wallets.deployer.address)).to.equal(oneEther);
                expect(await sut.getTotalShares()).to.equal(oneEther);
            });

            it("Should emit LiquidityAdded", async function () {
                const { sut, token, wallets } = await loadFixture(fixture);

                await token.mint(wallets.deployer.address, oneEther);
                await token.approve(sut.target, oneEther);

                await sut.mockCanChangeLiquidity(true);

                await expect(sut.deposit(oneEther))
                    .to.emit(sut, "LiquidityAdded")
                    .withArgs(wallets.deployer.address, oneEther, oneEther);
            });

            it("Should reset the _available liquidity", async function () {
                const { sut, token, wallets } = await loadFixture(fixture);

                await token.mint(wallets.deployer.address, oneEther);
                await token.approve(sut.target, oneEther);

                await sut.mockCanChangeLiquidity(true);

                await sut.deposit(oneEther);

                expect(await sut.getAvailableLiquidity()).to.equal(oneEther / 10n);
            });
        });

        describe("_canChangeLiquidity() == false", function () {
            it("Should push the deposit into the liquidity queue", async function () {
                const { sut, token, wallets } = await loadFixture(fixture);

                await token.mint(wallets.deployer.address, oneEther);
                await token.approve(sut.target, oneEther);

                await sut.mockCanChangeLiquidity(false);

                await sut.deposit(oneEther);

                const queue = await sut.getLiquidityQueue();
                expect(queue.length).to.equal(1);
                expect(queue[0].amount).to.equal(oneEther);
                expect(queue[0].user).to.equal(wallets.deployer.address);
                expect(queue[0].action).to.equal(0);
            });

            it("Should increase the staged balance", async function () {
                const { sut, token, wallets } = await loadFixture(fixture);

                await token.mint(wallets.deployer.address, oneEther);
                await token.approve(sut.target, oneEther);

                await sut.mockCanChangeLiquidity(false);

                await sut.deposit(oneEther);

                expect(await sut.getStagedBalance()).to.equal(oneEther);
            });

            it("Should emit LiquidityChangeQueued", async function () {
                const { sut, token, wallets } = await loadFixture(fixture);

                await token.mint(wallets.deployer.address, oneEther);
                await token.approve(sut.target, oneEther);

                await sut.mockCanChangeLiquidity(false);

                await expect(sut.deposit(oneEther))
                    .to.emit(sut, "LiquidityChangeQueued")
                    .withArgs(0, wallets.deployer.address, oneEther);
            });
        });
    });

    describe("withdraw", function () {
        it("Should revert if the value is 0", async function () {
            const { sut } = await loadFixture(fixture);

            await expect(sut.withdraw(0)).to.be.revertedWithCustomError(sut, "InvalidValue");
        });

        describe("_canChangeLiquidity() == true", function () {
            it("Should revert if the user does not have enough shares", async function () {
                const { sut } = await loadFixture(fixture);

                await sut.mockCanChangeLiquidity(true);

                await expect(sut.withdraw(oneEther)).to.be.revertedWithCustomError(sut, "InsufficientShares");
            });

            it("Should correctly update the shares for a full withdraw", async function () {
                const { sut, token, wallets } = await loadFixture(fixture);

                await token.mint(wallets.deployer.address, oneEther);
                await token.approve(sut.target, oneEther);

                await sut.mockCanChangeLiquidity(true);

                await sut.deposit(oneEther);
                await sut.withdraw(oneEther);

                expect(await sut.getShares(wallets.deployer.address)).to.equal(0);
                expect(await sut.getTotalShares()).to.equal(0);
            });

            it("Should set accurate shares for a partial withdraw", async function () {
                const { sut, token, wallets } = await loadFixture(fixture);

                await token.mint(wallets.deployer.address, oneEther);
                await token.approve(sut.target, oneEther);

                await sut.mockCanChangeLiquidity(true);

                await sut.deposit(oneEther);
                await sut.withdraw(oneEther / 4n);

                expect(await sut.getShares(wallets.deployer.address)).to.equal((oneEther / 4n) * 3n);
                expect(await sut.getTotalShares()).to.equal((oneEther / 4n) * 3n);

                await sut.withdraw((oneEther / 4n) * 3n);

                expect(await sut.getShares(wallets.deployer.address)).to.equal(0);
                expect(await sut.getTotalShares()).to.equal(0);
            });

            it("Should emit LiquidityRemoved", async function () {
                const { sut, token, wallets } = await loadFixture(fixture);

                await token.mint(wallets.deployer.address, oneEther);
                await token.approve(sut.target, oneEther);

                await sut.mockCanChangeLiquidity(true);

                await sut.deposit(oneEther);

                await expect(sut.withdraw(oneEther))
                    .to.emit(sut, "LiquidityRemoved")
                    .withArgs(wallets.deployer.address, oneEther, oneEther);
            });

            it("Should reset the _available liquidity", async function () {
                const { sut, token, wallets } = await loadFixture(fixture);

                await token.mint(wallets.deployer.address, oneEther);
                await token.approve(sut.target, oneEther);

                await sut.mockCanChangeLiquidity(true);

                await sut.deposit(oneEther);
                await sut.withdraw(oneEther);

                expect(await sut.getAvailableLiquidity()).to.equal(0n);
            });
        });

        describe("_canChangeLiquidity() == false", function () {
            it("Should push the withdraw into the liquidity queue when the user has not deposited", async function () {
                const { sut, token, wallets } = await loadFixture(fixture);

                await token.mint(wallets.deployer.address, oneEther);
                await token.approve(sut.target, oneEther);

                await sut.mockCanChangeLiquidity(false);

                await sut.withdraw(oneEther);

                const queue = await sut.getLiquidityQueue();
                expect(queue.length).to.equal(1);
                expect(queue[0].amount).to.equal(oneEther);
                expect(queue[0].user).to.equal(wallets.deployer.address);
                expect(queue[0].action).to.equal(1);
            });

            it("Should push the withdraw into the liquidity queue when the user has deposited", async function () {
                const { sut, token, wallets } = await loadFixture(fixture);

                await token.mint(wallets.deployer.address, oneEther);
                await token.approve(sut.target, oneEther);

                await sut.mockCanChangeLiquidity(true);

                await sut.deposit(oneEther);

                await sut.mockCanChangeLiquidity(false);

                await sut.withdraw(oneEther);

                const queue = await sut.getLiquidityQueue();
                expect(queue.length).to.equal(1);
                expect(queue[0].amount).to.equal(oneEther);
                expect(queue[0].user).to.equal(wallets.deployer.address);
                expect(queue[0].action).to.equal(1);
            });

            it("Should emit LiquidityChangeQueued", async function () {
                const { sut, token, wallets } = await loadFixture(fixture);

                await token.mint(wallets.deployer.address, oneEther);
                await token.approve(sut.target, oneEther);

                await sut.mockCanChangeLiquidity(true);

                await sut.deposit(oneEther);

                await sut.mockCanChangeLiquidity(false);

                await expect(sut.withdraw(oneEther))
                    .to.emit(sut, "LiquidityChangeQueued")
                    .withArgs(1, wallets.deployer.address, oneEther);
            });
        });
    });

    describe("_clearLiquidityQueue", function () {
        it("Should ignore an invalid remove", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            await sut.mockCanChangeLiquidity(false);

            await sut.withdraw(oneEther);

            await sut.clearLiquidityQueue();

            const lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(0);
            expect(await sut.getShares(wallets.deployer)).to.equal(0);
        });

        it("Should add liquidity", async function () {
            const { sut, token, wallets } = await loadFixture(fixture);

            await token.mint(wallets.deployer.address, oneEther);
            await token.approve(sut.target, oneEther);

            await sut.mockCanChangeLiquidity(false);

            await sut.deposit(oneEther);

            await sut.clearLiquidityQueue();

            const lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(oneEther);
            expect(await sut.getShares(wallets.deployer)).to.equal(oneEther);
            expect(await token.balanceOf(wallets.deployer.address)).to.equal(0);
            expect(await token.balanceOf(sut.target)).to.equal(oneEther);
        });

        it("Should remove liquidity", async function () {
            const { sut, token, wallets } = await loadFixture(fixture);

            await token.mint(wallets.deployer.address, oneEther);
            await token.approve(sut.target, oneEther);

            await sut.mockCanChangeLiquidity(false);

            await sut.deposit(oneEther);
            await sut.withdraw(oneEther);

            await sut.clearLiquidityQueue();

            const lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(0);
            expect(await sut.getShares(wallets.deployer)).to.equal(0);

            expect(await token.balanceOf(wallets.deployer.address)).to.equal(oneEther);
            expect(await token.balanceOf(sut.target)).to.equal(0);
        });

        it("Should add multiple", async function () {
            const { sut, token, wallets } = await loadFixture(fixture);

            const adds = [wallets.alice, wallets.bob, wallets.charlie];

            await sut.mockCanChangeLiquidity(false);

            for (const wallet of adds) {
                await token.mint(wallet.address, oneEther);
                await token.connect(wallet).approve(sut.target, oneEther);
                await sut.connect(wallet).deposit(oneEther);
            }

            await sut.clearLiquidityQueue();

            const lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(oneEther * BigInt(adds.length));
            expect(await token.balanceOf(sut.target)).to.equal(oneEther * BigInt(adds.length));

            for (const wallet of adds) {
                expect(await sut.getShares(wallet)).to.equal(oneEther);
                expect(await token.balanceOf(wallet.address)).to.equal(0);
            }
        });

        it("Should remove multiple", async function () {
            const { sut, token, wallets } = await loadFixture(fixture);

            const adds = [wallets.alice, wallets.bob, wallets.charlie];
            const removes = [wallets.alice, wallets.bob, wallets.charlie];

            await sut.mockCanChangeLiquidity(false);

            for (const wallet of adds) {
                await token.mint(wallet.address, oneEther);
                await token.connect(wallet).approve(sut.target, oneEther);
                await sut.connect(wallet).deposit(oneEther);
            }

            for (const wallet of removes) {
                await sut.connect(wallet).withdraw(oneEther);
            }

            await sut.clearLiquidityQueue();

            const lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(0);
            expect(await token.balanceOf(sut.target)).to.equal(0);

            for (const wallet of removes) {
                expect(await sut.getShares(wallet)).to.equal(0);
                expect(await token.balanceOf(wallet.address)).to.equal(oneEther);
            }
        });

        it("Should behave well with multiple clearLiquidityQueues", async function () {
            const { sut, token, wallets } = await loadFixture(fixture);

            let lq = await sut.getLiquidityQueue();

            await sut.mockCanChangeLiquidity(false);

            for (const wallet of [wallets.alice, wallets.bob, wallets.charlie]) {
                await token.mint(wallet.address, oneEther);
                await token.connect(wallet).approve(sut.target, oneEther);
            }

            // ----------------------------------------------------------------------

            await sut.connect(wallets.alice).deposit(oneEther);
            await sut.connect(wallets.bob).deposit(oneEther);
            await sut.clearLiquidityQueue();

            lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(oneEther + oneEther);
            expect(await token.balanceOf(sut.target)).to.equal(oneEther + oneEther);

            expect(await sut.getShares(wallets.alice)).to.equal(oneEther);
            expect(await token.balanceOf(wallets.alice.address)).to.equal(0);

            expect(await sut.getShares(wallets.bob)).to.equal(oneEther);
            expect(await token.balanceOf(wallets.bob.address)).to.equal(0);

            // ----------------------------------------------------------------------

            await sut.connect(wallets.bob).withdraw(oneEther);
            await sut.connect(wallets.charlie).deposit(oneEther);
            await sut.clearLiquidityQueue();

            lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(oneEther + oneEther);
            expect(await token.balanceOf(sut.target)).to.equal(oneEther + oneEther);

            expect(await sut.getShares(wallets.alice)).to.equal(oneEther);
            expect(await token.balanceOf(wallets.alice.address)).to.equal(0);

            expect(await sut.getShares(wallets.bob)).to.equal(0);
            expect(await token.balanceOf(wallets.bob.address)).to.equal(oneEther);

            expect(await sut.getShares(wallets.charlie)).to.equal(oneEther);
            expect(await token.balanceOf(wallets.charlie.address)).to.equal(0);

            // ----------------------------------------------------------------------

            await sut.connect(wallets.alice).withdraw(oneEther);
            await sut.connect(wallets.charlie).withdraw(oneEther);
            await sut.clearLiquidityQueue();

            lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(0);
            expect(await token.balanceOf(sut.target)).to.equal(0);

            expect(await sut.getShares(wallets.alice)).to.equal(0);
            expect(await token.balanceOf(wallets.alice.address)).to.equal(oneEther);

            expect(await sut.getShares(wallets.bob)).to.equal(0);
            expect(await token.balanceOf(wallets.bob.address)).to.equal(oneEther);

            expect(await sut.getShares(wallets.charlie)).to.equal(0);
            expect(await token.balanceOf(wallets.charlie.address)).to.equal(oneEther);
        });

        it("Should allow for varied amounts", async function () {
            const { sut, token, wallets } = await loadFixture(fixture);

            const users = [wallets.alice, wallets.bob, wallets.charlie];

            await sut.mockCanChangeLiquidity(false);

            const initialBalance = 100n * oneEther;

            for (const wallet of users) {
                await token.mint(wallet.address, initialBalance);
                await token.connect(wallet).approve(sut.target, initialBalance);
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
                    if (item.action === 0) {
                        await sut.connect(item.wallet).deposit(item.amount);
                    } else {
                        await sut.connect(item.wallet).withdraw(item.amount);
                    }
                }
                await sut.clearLiquidityQueue();
            }

            const lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(0);
            expect(await token.balanceOf(sut.target)).to.equal(0);

            for (const wallet of users) {
                expect(await sut.getShares(wallet)).to.equal(0);
                expect(await token.balanceOf(wallet.address)).to.equal(initialBalance);
            }
        });

        it("Should allow for added tokens", async function () {
            const { sut, token, wallets } = await loadFixture(fixture);

            await sut.mockCanChangeLiquidity(false);

            const initialBalance = 100n * oneEther;

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
                await token.mint(add.wallet.address, initialBalance);
                await token.connect(add.wallet).approve(sut.target, initialBalance);
                await sut.connect(add.wallet).deposit(add.amount);
            }

            await sut.clearLiquidityQueue();

            expect(await sut.getTotalShares()).to.equal(10n * oneEther);
            expect(await token.balanceOf(sut.target)).to.equal(10n * oneEther);

            // MOCK game finishing to add new money into the pot.
            await token.mint(sut.target, initialBalance); // 100 extra tokens, for 10 shares

            for (const remove of removes) {
                await sut.connect(remove.wallet).withdraw(await sut.getShares(remove.wallet.address));
            }

            await sut.clearLiquidityQueue();

            const lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(0);
            expect(await token.balanceOf(sut.target)).to.equal(0);

            for (const remove of removes) {
                expect(await sut.getShares(remove.wallet)).to.equal(0);
                expect(await token.balanceOf(remove.wallet.address)).to.equal(
                    initialBalance + share * remove.multiplier
                );
            }
        });

        it("Should allow for removed tokens", async function () {
            const { sut, token, wallets } = await loadFixture(fixture);

            await sut.mockCanChangeLiquidity(false);

            const initialBalance = 100n * oneEther;

            const adds = [
                { wallet: wallets.alice, amount: oneEther },
                { wallet: wallets.bob, amount: oneEther * 3n },
                { wallet: wallets.charlie, amount: oneEther * 6n },
            ];

            const removes = [
                { wallet: wallets.alice, amount: adds[0].amount / 2n },
                { wallet: wallets.bob, amount: adds[1].amount / 2n },
                { wallet: wallets.charlie, amount: adds[2].amount / 2n },
            ];

            for (const add of adds) {
                await token.mint(add.wallet.address, initialBalance);
                await token.connect(add.wallet).approve(sut.target, initialBalance);
                await sut.connect(add.wallet).deposit(add.amount);
            }

            await sut.clearLiquidityQueue();

            expect(await sut.getTotalShares()).to.equal(10n * oneEther);
            expect(await token.balanceOf(sut.target)).to.equal(10n * oneEther);

            await sut.mockLoss(5n * oneEther); // Half the tokens

            for (const remove of removes) {
                await sut.connect(remove.wallet).withdraw(await sut.getShares(remove.wallet.address));
            }

            await sut.clearLiquidityQueue();

            const lq = await sut.getLiquidityQueue();
            expect(lq.length).to.equal(0);

            expect(await sut.getTotalShares()).to.equal(0);
            expect(await token.balanceOf(sut.target)).to.equal(0);

            for (const remove of removes) {
                expect(await sut.getShares(remove.wallet)).to.equal(0);
                expect(await token.balanceOf(remove.wallet.address)).to.equal(initialBalance - remove.amount);
            }
        });
    });

    describe("_useRoundLiquidity", function () {
        it("Should revert if the amount is greater than the available", async function () {
            const { sut } = await loadFixture(fixture);

            await expect(sut.useRoundLiquidity(oneEther)).to.be.revertedWithCustomError(sut, "InsufficientLiquidity");
        });

        it("Should decrease the available liquidity by the amount", async function () {
            const { sut, token, wallets } = await loadFixture(fixture);

            const deposited = oneEther * 10n;
            
            await token.mint(wallets.deployer.address, deposited);
            await token.approve(sut.target, deposited);

            await sut.mockCanChangeLiquidity(true);

            await sut.deposit(deposited);

            await sut.useRoundLiquidity(oneEther / 10n);

            // available is 10% of 10eth, so 1eth. 1eth - 0.1eth = 0.9eth 
            expect(await sut.getAvailableLiquidity()).to.equal(ethers.parseEther("0.9"));
        });

        it("Should not call _onLowLiquidity when hitting the threshold", async function () {
            const { sut, token, wallets } = await loadFixture(fixture);

            const deposited = oneEther * 10n;

            await token.mint(wallets.deployer.address, deposited);
            await token.approve(sut.target, deposited);

            await sut.mockCanChangeLiquidity(true);

            await sut.deposit(deposited);

            await expect(sut.useRoundLiquidity(oneEther - lowLiquidityThreshold)).to.not.emit(sut, "OnLowLiquidity");
        });

        it("Should call _onLowLiquidity when dropping below the threshold", async function () {
            const { sut, token, wallets } = await loadFixture(fixture);

            const deposited = oneEther * 10n;

            await token.mint(wallets.deployer.address, deposited);
            await token.approve(sut.target, deposited);

            await sut.mockCanChangeLiquidity(true);

            await sut.deposit(deposited);

            await expect(sut.useRoundLiquidity(oneEther)).to.emit(sut, "OnLowLiquidity");
        });
    });

    describe("_releaseRoundLiquidity", function () {
        it("Should increase the available liquidity by the amount", async function () {
            const { sut } = await loadFixture(fixture);

            await sut.releaseRoundLiquidity(oneEther);

            expect(await sut.getAvailableLiquidity()).to.equal(oneEther);
        });
    });
});
