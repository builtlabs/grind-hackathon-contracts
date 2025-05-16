import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

const oneEther = ethers.parseEther("1");

describe("ERC20Holder", function () {
    async function fixture() {
        const [deployer] = await ethers.getSigners();

        const TOKEN = await ethers.getContractFactory("MockERC20");
        const token = await TOKEN.deploy();
        await token.waitForDeployment();

        const SUT = await ethers.getContractFactory("ERC20HolderHarness");
        const sut = await SUT.deploy(token.target);

        return {
            sut,
            token,
            wallet: deployer,
        };
    }

    // ############################ TESTS ############################

    describe("constructor", function () {
        it("Should set the token address", async function () {
            const { sut, token } = await loadFixture(fixture);

            expect(await sut.token()).to.equal(token.target);
        });
    });

    describe("_getBalance", function () {
        it("Should initially return 0", async function () {
            const { sut } = await loadFixture(fixture);

            expect(await sut.balance()).to.equal(0);
        });

        it("Should return the contract token balance", async function () {
            const { sut, token } = await loadFixture(fixture);

            await token.mint(sut.target, oneEther);

            expect(await sut.balance()).to.equal(oneEther);
        });
    });

    describe("_receiveValue", function () {
        it("Should revert if transferFrom returns false", async function () {
            const { sut, token, wallet } = await loadFixture(fixture);

            await token.mint(wallet.address, oneEther);
            await token.approve(sut.target, oneEther);

            await token.mockReturn();

            await expect(sut.receiveValue(wallet.address, oneEther))
                .to.be.revertedWithCustomError(sut, "SafeERC20FailedOperation")
                .withArgs(token.target);
        });

        it("Should revert if the sender has not approved", async function () {
            const { sut, token, wallet } = await loadFixture(fixture);

            await token.mint(wallet.address, oneEther);

            await expect(sut.receiveValue(wallet.address, oneEther))
                .to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance")
                .withArgs(sut.target, 0, oneEther);
        });

        it("Should revert if the sender has insufficient funds", async function () {
            const { sut, token, wallet } = await loadFixture(fixture);

            await token.approve(sut.target, oneEther);

            await expect(sut.receiveValue(wallet.address, oneEther))
                .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance")
                .withArgs(wallet.address, 0, oneEther);
        });

        it("Should send the token amount from the caller to the contract", async function () {
            const { sut, token, wallet } = await loadFixture(fixture);

            await token.mint(wallet.address, oneEther);
            await token.approve(sut.target, oneEther);

            expect(await token.balanceOf(wallet.address)).to.equal(oneEther);
            expect(await token.balanceOf(sut.target)).to.equal(0);

            await sut.receiveValue(wallet.address, oneEther);

            expect(await token.balanceOf(wallet.address)).to.equal(0);
            expect(await token.balanceOf(sut.target)).to.equal(oneEther);
        });
    });

    describe("_sendValue", function () {
        it("Should revert if transfer returns false", async function () {
            const { sut, token, wallet } = await loadFixture(fixture);

            await token.mint(sut.target, oneEther);

            await token.mockReturn();

            await expect(sut.sendValue(wallet.address, oneEther))
                .to.be.revertedWithCustomError(sut, "SafeERC20FailedOperation")
                .withArgs(token.target);
        });

        it("Should revert if the contract has insufficient funds", async function () {
            const { sut, token, wallet } = await loadFixture(fixture);

            await expect(sut.sendValue(wallet.address, oneEther))
                .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance")
                .withArgs(sut.target, 0, oneEther);
        });

        it("Should send the token from the contract to the wallet", async function () {
            const { sut, token, wallet } = await loadFixture(fixture);

            await token.mint(sut.target, oneEther);

            expect(await token.balanceOf(wallet.address)).to.equal(0);
            expect(await token.balanceOf(sut.target)).to.equal(oneEther);

            await sut.sendValue(wallet.address, oneEther);

            expect(await token.balanceOf(wallet.address)).to.equal(oneEther);
            expect(await token.balanceOf(sut.target)).to.equal(0);
        });
    });
});
