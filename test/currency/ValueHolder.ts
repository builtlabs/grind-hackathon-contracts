import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

const oneEther = ethers.parseEther("1");

describe("ValueHolder", function () {
    async function fixture() {
        const SUT = await ethers.getContractFactory("ValueHolderHarness");
        const sut = await SUT.deploy();

        return sut;
    }

    // ############################ TESTS ############################

    describe("hasAvailableBalance", function () {
        it("Should revert if the value is greater than the available balance", async function () {
            const sut = await loadFixture(fixture);

            await expect(sut.sendValue(oneEther))
                .to.be.revertedWithCustomError(sut, "ValueHolderInsufficientAvailableBalance");
        });

        it("Should NOT revert if the value is the available balance", async function () {
            const sut = await loadFixture(fixture);

            await sut.receiveValue(oneEther);

            await expect(sut.sendValue(oneEther))
                .to.not.be.reverted;
        });

        it("Should NOT revert if the value is less than the available balance", async function () {
            const sut = await loadFixture(fixture);

            await sut.receiveValue(oneEther);

            await expect(sut.sendValue(oneEther / 2n))
                .to.not.be.reverted;
        });
    });

    describe("_getAvailableBalance", function () {
        it("Should return the balance - the staged balance", async function () {
            const sut = await loadFixture(fixture);

            await sut.receiveValue(oneEther); // Balance is now 1 ether
            await sut.stageAmount(oneEther / 4n); // Staged balance is now 0.25 ether

            // Available balance should be 0.75 ether
            expect(await sut.getAvailableBalance()).to.equal(oneEther / 4n * 3n);
        });
    });

    describe("_stageAmount", function () {
        it("Should increment the staged balance", async function () {
            const sut = await loadFixture(fixture);

            await sut.stageAmount(oneEther); // Staged balance is now 0.25 ether

            expect(await sut.getStagedBalance()).to.equal(oneEther);
        });

        it("Should emit StagedBalanceIncreased", async function () {
            const sut = await loadFixture(fixture);

            await expect(sut.stageAmount(oneEther))
                .to.emit(sut, "StagedBalanceIncreased")
                .withArgs(oneEther);
        });
    });

    describe("_unstageAmount", function () {
        it("Should revert if the staged balance is less than the amount", async function () {
            const sut = await loadFixture(fixture);

            await sut.stageAmount(oneEther / 2n); // Staged balance is now 0.5 ether

            await expect(sut.unstageAmount(oneEther))
                .to.be.revertedWithCustomError(sut, "ValueHolderInsufficientStagedBalance");
        });

        it("Should reduce the staged balance by the amount when amount is the staged balance", async function () {
            const sut = await loadFixture(fixture);

            await sut.stageAmount(oneEther); // Staged balance is now 1 ether
            await sut.unstageAmount(oneEther); // Staged balance should now be 0 ether

            expect(await sut.getStagedBalance()).to.equal(0);
        });

        it("Should reduce the staged balance by the amount when amount is less than the staged balance", async function () {
            const sut = await loadFixture(fixture);

            await sut.stageAmount(oneEther); // Staged balance is now 1 ether
            await sut.unstageAmount(oneEther / 4n); // Staged balance should now be 0.25 ether

            // Staged balance should now be 0.75 ether
            expect(await sut.getStagedBalance()).to.equal(oneEther / 4n * 3n);
        });

        it("Should emit StagedBalanceDecreased", async function () {
            const sut = await loadFixture(fixture);

            await sut.stageAmount(oneEther); // Staged balance is now 1 ether
            await expect(sut.unstageAmount(oneEther / 4n))
                .to.emit(sut, "StagedBalanceDecreased")
                .withArgs(oneEther / 4n);
        });
    });
});
