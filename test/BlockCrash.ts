import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("BlockCrash", function () {
    async function deployFixture() {
        const [deployer, alice, bob, charlie] = await ethers.getSigners();

        const GRIND = await ethers.getContractFactory("Grind");
        const grind = await GRIND.deploy();
        await grind.waitForDeployment();

        const BLOCKCRASH = await ethers.getContractFactory("BlockCrash");
        const sut = await BLOCKCRASH.deploy(await grind.getAddress());

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
            const { sut, grind } = await loadFixture(deployFixture);

            await expect(sut.queueLiquidityChange(0, 0)).to.be.revertedWithCustomError(sut, "ZeroAmountError");
        });

        it("Should revert if the action is greater than 1", async function () {
            const { sut } = await loadFixture(deployFixture);

            await expect(sut.queueLiquidityChange(10, 2)).to.be.revertedWithCustomError(sut, "InvalidActionError");
        });

        it("Should push to the LQ", async function () {
            const { sut, wallets } = await loadFixture(deployFixture);

            const tx = await sut.queueLiquidityChange(0, 10);
            await tx.wait();

            const lq = await sut.getLiquidityQueue();

            expect(lq.length).to.equal(1);
            expect(lq[0].user).to.equal(wallets.deployer.address);
            expect(lq[0].amount).to.equal(10);
            expect(lq[0].action).to.equal(0);
        });

        it("Should emit the LiquidityChangeQueued event", async function () {
            const { sut, wallets } = await loadFixture(deployFixture);

            await expect(sut.queueLiquidityChange(0, 10))
                .to.emit(sut, "LiquidityChangeQueued")
                .withArgs(0, wallets.deployer.address, 10);
        });
    });

    // describe("reset", function () {
    //     it("Should ", async function () {
    //         const { sut } = await loadFixture(deployFixture);
    //     });

    //     it("Should ", async function () {
    //         const { sut } = await loadFixture(deployFixture);
    //     });

    //     it("Should ", async function () {
    //         const { sut } = await loadFixture(deployFixture);
    //     });
    // });

    // describe("", function () {
    //     it("Should ", async function () {
    //         const { sut } = await loadFixture(deployFixture);
    //     });

    //     it("Should ", async function () {
    //         const { sut } = await loadFixture(deployFixture);
    //     });

    //     it("Should ", async function () {
    //         const { sut } = await loadFixture(deployFixture);
    //     });
    // });

    // describe("", function () {
    //     it("Should ", async function () {
    //         const { sut } = await loadFixture(deployFixture);
    //     });

    //     it("Should ", async function () {
    //         const { sut } = await loadFixture(deployFixture);
    //     });

    //     it("Should ", async function () {
    //         const { sut } = await loadFixture(deployFixture);
    //     });
    // });

    // describe("", function () {
    //     it("Should ", async function () {
    //         const { sut } = await loadFixture(deployFixture);
    //     });

    //     it("Should ", async function () {
    //         const { sut } = await loadFixture(deployFixture);
    //     });

    //     it("Should ", async function () {
    //         const { sut } = await loadFixture(deployFixture);
    //     });
    // });
});
