import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

const oneEther = ethers.parseEther("1");

describe("NativeHolder", function () {
    async function fixture() {
        const [_, wallet] = await ethers.getSigners();

        const NativeBlocking = await ethers.getContractFactory("NativeBlocking");
        const nativeBlocking = await NativeBlocking.deploy();
        await nativeBlocking.waitForDeployment();

        const NativeReceiving = await ethers.getContractFactory("NativeReceiving");
        const nativeReceiving = await NativeReceiving.deploy();
        await nativeReceiving.waitForDeployment();

        const SUT = await ethers.getContractFactory("NativeHolderHarness");
        const sut = await SUT.deploy(1n); // Minimum value is set to 1 wei, not relevant here.

        return {
            sut,
            nativeBlocking,
            nativeReceiving,
            wallet: wallet,
        };
    }

    // ############################ TESTS ############################

    describe("setSendGasLimit", function () {
        it("Should revert if the caller is not the owner", async function () {
            const { sut } = await loadFixture(fixture);

            const [_, alice] = await ethers.getSigners();

            await expect(sut.connect(alice).setSendGasLimit(2300n)).to.be.revertedWithCustomError(
                sut,
                "OwnableUnauthorizedAccount"
            );
        });

        it("Should set the minimum", async function () {
            const { sut } = await loadFixture(fixture);

            const limit = 2300n;
            await sut.setSendGasLimit(limit);

            expect(await sut.getSendGasLimit()).to.equal(limit);
        });
    });

    describe("claim", function () {
        async function stagedBalanceFixture() {
            const { sut, nativeReceiving, wallet } = await fixture();

            const calldata = sut.interface.encodeFunctionData("receiveValue", [oneEther]);
            await nativeReceiving.call(sut.target, calldata, { value: oneEther });

            await nativeReceiving.toggleBlocked();

            await sut.sendValue(nativeReceiving.target, oneEther);

            expect(await sut.getStagedBalance()).to.equal(oneEther);
            expect(await sut.getUnclaimedBalance(nativeReceiving.target)).to.equal(oneEther);

            return { sut, nativeReceiving, wallet };
        }

        it("Should do nothing if the unclaimed balance is zero", async function () {
            const { sut, wallet } = await loadFixture(fixture);

            const stagedBalanceBefore = await sut.getStagedBalance();
            const availableBalanceBefore = await sut.getAvailableBalance();
            const unclaimedBalanceBefore = await sut.getUnclaimedBalance(wallet.address);

            await sut.claim();

            expect(await sut.getStagedBalance()).to.equal(stagedBalanceBefore);
            expect(await sut.getAvailableBalance()).to.equal(availableBalanceBefore);
            expect(await sut.getUnclaimedBalance(wallet.address)).to.equal(unclaimedBalanceBefore);
        });

        describe("unblocked", function () {
            it("Should reduce the staged amount", async function () {
                const { sut, nativeReceiving } = await loadFixture(stagedBalanceFixture);

                await nativeReceiving.toggleBlocked();

                const calldata = sut.interface.encodeFunctionData("claim");
                await nativeReceiving.call(sut.target, calldata);

                expect(await sut.getStagedBalance()).to.equal(0);
            });

            it("Should delete the staged balance", async function () {
                const { sut, nativeReceiving } = await loadFixture(stagedBalanceFixture);

                await nativeReceiving.toggleBlocked();

                const calldata = sut.interface.encodeFunctionData("claim");
                await nativeReceiving.call(sut.target, calldata);

                expect(await sut.getUnclaimedBalance(nativeReceiving.target)).to.equal(0);
            });

            it("Should transfer the ether", async function () {
                const { sut, nativeReceiving } = await loadFixture(stagedBalanceFixture);

                await nativeReceiving.toggleBlocked();

                const sutBalanceBefore = await ethers.provider.getBalance(sut.target);
                const receivingBalanceBefore = await ethers.provider.getBalance(nativeReceiving.target);

                const calldata = sut.interface.encodeFunctionData("claim");
                await nativeReceiving.call(sut.target, calldata);

                expect(await ethers.provider.getBalance(sut.target)).to.equal(sutBalanceBefore - oneEther);
                expect(await ethers.provider.getBalance(nativeReceiving.target)).to.equal(
                    receivingBalanceBefore + oneEther
                );
            });

            it("Should emit UnclaimedBalanceClaimed", async function () {
                const { sut, nativeReceiving } = await loadFixture(stagedBalanceFixture);

                await nativeReceiving.toggleBlocked();

                const calldata = sut.interface.encodeFunctionData("claim");
                await expect(nativeReceiving.call(sut.target, calldata))
                    .to.emit(sut, "UnclaimedBalanceClaimed")
                    .withArgs(nativeReceiving.target, oneEther);
            });
        });

        describe("Still blocked", function () {
            it("Should revert with NativeHolderFailedToClaim", async function () {
                const { sut, nativeReceiving } = await loadFixture(stagedBalanceFixture);

                const calldata = sut.interface.encodeFunctionData("claim");
                await expect(nativeReceiving.call(sut.target, calldata)).to.be.revertedWithCustomError(
                    sut,
                    "NativeHolderFailedToClaim"
                );
            });
        });
    });

    describe("_getBalance", function () {
        it("Should initially return 0", async function () {
            const { sut } = await loadFixture(fixture);

            expect(await sut.getBalance()).to.equal(0);
        });

        it("Should return the contract token balance", async function () {
            const { sut } = await loadFixture(fixture);

            await sut.receiveValue(oneEther, { value: oneEther });

            expect(await sut.getBalance()).to.equal(oneEther);
        });
    });

    describe("_receiveValue", function () {
        it("Should revert if msg.value does not match the value", async function () {
            const { sut } = await loadFixture(fixture);

            await expect(sut.receiveValue(oneEther)).to.be.revertedWithCustomError(sut, "NativeHolderInvalidReceive");
        });

        it("Should send the amount from the caller to the contract", async function () {
            const { sut, wallet } = await loadFixture(fixture);

            const provider = ethers.provider;
            const walletBalanceBefore = await provider.getBalance(wallet.address);
            const sutBalanceBefore = await provider.getBalance(sut.target);

            const tx = await sut.connect(wallet).receiveValue(oneEther, { value: oneEther });
            const receipt = await tx.wait();

            let fee = 0n;
            if (receipt) {
                fee = receipt.fee;
            }

            expect(await provider.getBalance(wallet.address)).to.equal(walletBalanceBefore - oneEther - fee);
            expect(await provider.getBalance(sut.target)).to.equal(sutBalanceBefore + oneEther);
        });
    });

    describe("_sendValue", function () {
        it("Should revert if the contract has insufficient funds", async function () {
            const { sut, wallet } = await loadFixture(fixture);

            await expect(sut.sendValue(wallet.address, oneEther)).to.be.revertedWithCustomError(
                sut,
                "ValueHolderInsufficientAvailableBalance"
            );
        });

        it("Should send the eth from the contract to the wallet", async function () {
            const { sut, wallet } = await loadFixture(fixture);

            await sut.receiveValue(oneEther, { value: oneEther });

            const provider = ethers.provider;
            const walletBalanceBefore = await provider.getBalance(wallet.address);
            const sutBalanceBefore = await provider.getBalance(sut.target);

            await sut.sendValue(wallet.address, oneEther);

            expect(await provider.getBalance(wallet.address)).to.equal(walletBalanceBefore + oneEther);
            expect(await provider.getBalance(sut.target)).to.equal(sutBalanceBefore - oneEther);
        });

        it("Should send the eth from the contract to another contract", async function () {
            const { sut, nativeReceiving } = await loadFixture(fixture);

            await sut.receiveValue(oneEther, { value: oneEther });

            const provider = ethers.provider;
            const contractBalanceBefore = await provider.getBalance(nativeReceiving.target);
            const sutBalanceBefore = await provider.getBalance(sut.target);

            await sut.sendValue(nativeReceiving.target, oneEther);

            expect(await provider.getBalance(nativeReceiving.target)).to.equal(contractBalanceBefore + oneEther);
            expect(await sut.getAvailableBalance()).to.equal(sutBalanceBefore - oneEther);
        });

        it("Should stage the eth when sending from the contract to a blocking contract", async function () {
            const { sut, nativeBlocking } = await loadFixture(fixture);

            await sut.receiveValue(oneEther, { value: oneEther });

            const provider = ethers.provider;
            const contractBalanceBefore = await provider.getBalance(nativeBlocking.target);
            const sutBalanceBefore = await provider.getBalance(sut.target);

            await sut.sendValue(nativeBlocking.target, oneEther);

            expect(await provider.getBalance(nativeBlocking.target)).to.equal(contractBalanceBefore);
            expect(await sut.getAvailableBalance()).to.equal(sutBalanceBefore - oneEther);

            expect(await sut.getUnclaimedBalance(nativeBlocking.target)).to.equal(oneEther);
            expect(await sut.getStagedBalance()).to.equal(oneEther);
        });

        it("Should emit UnclaimedBalanceIncreased when sending from the contract to a blocking contract", async function () {
            const { sut, nativeBlocking } = await loadFixture(fixture);

            await sut.receiveValue(oneEther, { value: oneEther });

            await expect(sut.sendValue(nativeBlocking.target, oneEther))
                .to.emit(sut, "UnclaimedBalanceIncreased")
                .withArgs(nativeBlocking.target, oneEther);
        });
    });
});
