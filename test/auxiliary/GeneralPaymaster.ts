import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { BytesLike, hexlify, id, randomBytes } from "ethers";
import hre, { ethers } from "hardhat";

const oneEther = ethers.parseEther("1");

const generalSelector = "0x8c5a3445"; // IPaymasterFlow.general.selector

function createDummyTransaction(
    from: string,
    to: string,
    paymasterInput: BytesLike = generalSelector,
    gasLimit: bigint = oneEther,
    maxFeePerGas: bigint = oneEther
) {
    return {
        txType: 0n,
        from,
        to,
        gasLimit,
        gasPerPubdataByteLimit: oneEther,
        maxFeePerGas,
        maxPriorityFeePerGas: oneEther,
        paymaster: oneEther,
        nonce: oneEther,
        value: oneEther,
        reserved: [0n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint],
        data: "0x",
        signature: "0x",
        factoryDeps: [hexlify(randomBytes(32))],
        paymasterInput,
        reservedDynamic: "0x",
    };
}

describe("GeneralPaymaster", function () {
    async function fixture() {
        const [deployer, targetA, targetB, blockedSender, blockedTarget, bank] = await ethers.getSigners();

        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x0000000000000000000000000000000000008001"],
        });

        const bootloader = await ethers.getSigner("0x0000000000000000000000000000000000008001");

        const BLOCKING = await ethers.getContractFactory("NativeBlocking");
        const blocking = await BLOCKING.deploy();
        await blocking.waitForDeployment();

        const SUT = await ethers.getContractFactory("GeneralPaymaster");
        const sut = await SUT.deploy([targetA, targetB], deployer.address);
        await sut.waitForDeployment();

        await sut.setBlockedFrom(blockedSender.address, true);

        await bank.sendTransaction({
            to: sut.target,
            value: oneEther * 100n,
        });

        await bank.sendTransaction({
            to: bootloader.address,
            value: oneEther * 100n,
        });

        return {
            sut,
            blocking,
            wallets: {
                deployer,
                bootloader,
                targetA,
                targetB,
                blockedSender,
                blockedTarget,
            },
        };
    }

    // ############################ TESTS ############################

    describe("constructor", function () {
        it("Should set the owner", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            expect(await sut.owner()).to.equal(wallets.deployer.address);
        });

        it("Should set the allowed targets", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            expect(await sut.toAddressIsAllowed(wallets.targetA)).to.equal(true);
            expect(await sut.toAddressIsAllowed(wallets.targetB)).to.equal(true);
        });

        it("Should emit ToAllowedSet", async function () {
            const { wallets } = await loadFixture(fixture);

            const SUT = await ethers.getContractFactory("GeneralPaymaster");
            const sut = await SUT.deploy([wallets.targetA.address, wallets.targetB.address], wallets.deployer.address);
            const receipt = (await sut.deploymentTransaction()!.wait())!;

            const iface = SUT.interface;

            const topic = id("ToAllowedSet(address,bool)");
            const referralEvents = receipt.logs
                .filter((log) => log.topics[0] === topic)
                .map((log) => iface.decodeEventLog("ToAllowedSet", log.data, log.topics));

            expect(referralEvents).to.deep.include.members([
                [wallets.targetA.address, true],
                [wallets.targetB.address, true],
            ]);
        });
    });

    describe("setAllowedTo", function () {
        it("Should revert if the caller is not the owner", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            const target = wallets.targetA;
            const old = await sut.toAddressIsAllowed(target.address);

            await expect(sut.connect(target).setAllowedTo(target.address, !old))
                .to.be.revertedWithCustomError(sut, "OwnableUnauthorizedAccount")
                .withArgs(target.address);
        });

        it("Should set allowed to", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            const target = wallets.targetA;
            const old = await sut.toAddressIsAllowed(target.address);

            await sut.connect(wallets.deployer).setAllowedTo(target.address, !old);
            expect(await sut.toAddressIsAllowed(target.address)).to.equal(!old);
        });

        it("Should emit ToAllowedSet", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            const target = wallets.targetA;
            const old = await sut.toAddressIsAllowed(target.address);

            await expect(sut.connect(wallets.deployer).setAllowedTo(target.address, !old))
                .to.emit(sut, "ToAllowedSet")
                .withArgs(target.address, !old);
        });
    });

    describe("setBlockedFrom", function () {
        it("Should revert if the caller is not the owner", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            const target = wallets.targetA;
            const old = await sut.fromAddressIsBlocked(target.address);

            await expect(sut.connect(target).setBlockedFrom(target.address, !old))
                .to.be.revertedWithCustomError(sut, "OwnableUnauthorizedAccount")
                .withArgs(target.address);
        });

        it("Should set blocked from", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            const target = wallets.targetA;
            const old = await sut.fromAddressIsBlocked(target.address);

            await sut.connect(wallets.deployer).setBlockedFrom(target.address, !old);
            expect(await sut.fromAddressIsBlocked(target.address)).to.equal(!old);
        });

        it("Should emit FromBlockedSet", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            const target = wallets.targetA;
            const old = await sut.fromAddressIsBlocked(target.address);

            await expect(sut.connect(wallets.deployer).setBlockedFrom(target.address, !old))
                .to.emit(sut, "FromBlockedSet")
                .withArgs(target.address, !old);
        });
    });

    describe("withdraw", function () {
        it("Should revert if the caller is not the owner", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            await expect(sut.connect(wallets.targetA).withdraw(oneEther))
                .to.be.revertedWithCustomError(sut, "OwnableUnauthorizedAccount")
                .withArgs(wallets.targetA.address);
        });

        it("Should withdraw the amount to the owner", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            const sutBalanceBefore = await ethers.provider.getBalance(sut.target);
            const ownerBalanceBefore = await ethers.provider.getBalance(wallets.deployer.address);

            const tx = await sut.connect(wallets.deployer).withdraw(oneEther);
            const receipt = await tx.wait();

            if (!receipt) {
                throw new Error("Transaction receipt is null");
            }

            const gasSpent = receipt.gasUsed * receipt.gasPrice;

            expect(await ethers.provider.getBalance(sut.target)).to.equal(sutBalanceBefore - oneEther);
            expect(await ethers.provider.getBalance(wallets.deployer.address)).to.equal(
                ownerBalanceBefore + oneEther - gasSpent
            );
        });

        it("Should revert if the withdrawal fails", async function () {
            const { sut, blocking } = await loadFixture(fixture);

            await sut.transferOwnership(blocking.target);

            const calldata = sut.interface.encodeFunctionData("withdraw", [oneEther]);

            await expect(blocking.call(sut.target, calldata)).to.be.revertedWithCustomError(
                sut,
                "FailedToTransferEther"
            );
        });
    });

    describe("withdrawAll", function () {
        it("Should revert if the caller is not the owner", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            await expect(sut.connect(wallets.targetA).withdrawAll())
                .to.be.revertedWithCustomError(sut, "OwnableUnauthorizedAccount")
                .withArgs(wallets.targetA.address);
        });

        it("Should withdraw the balance to the owner", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            const sutBalanceBefore = await ethers.provider.getBalance(sut.target);
            const ownerBalanceBefore = await ethers.provider.getBalance(wallets.deployer.address);

            const tx = await sut.connect(wallets.deployer).withdrawAll();
            const receipt = await tx.wait();

            if (!receipt) {
                throw new Error("Transaction receipt is null");
            }

            const gasSpent = receipt.gasUsed * receipt.gasPrice;

            expect(await ethers.provider.getBalance(sut.target)).to.equal(0n);
            expect(await ethers.provider.getBalance(wallets.deployer.address)).to.equal(
                ownerBalanceBefore + sutBalanceBefore - gasSpent
            );
        });

        it("Should revert if the withdrawal fails", async function () {
            const { sut, blocking } = await loadFixture(fixture);

            await sut.transferOwnership(blocking.target);

            const calldata = sut.interface.encodeFunctionData("withdrawAll");

            await expect(blocking.call(sut.target, calldata)).to.be.revertedWithCustomError(
                sut,
                "FailedToTransferEther"
            );
        });
    });

    describe("validateAndPayForPaymasterTransaction", function () {
        it("Should revert if the caller is not the bootloader", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            const hash = hexlify(randomBytes(32));
            const suggestedHash = hexlify(randomBytes(32));
            const transaction = createDummyTransaction(wallets.targetA.address, wallets.targetB.address);

            await expect(
                sut.connect(wallets.targetA).validateAndPayForPaymasterTransaction(hash, suggestedHash, transaction)
            ).to.be.revertedWithCustomError(sut, "NotBootloader");
        });

        it("Should revert if the from address is blocked", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            const hash = hexlify(randomBytes(32));
            const suggestedHash = hexlify(randomBytes(32));
            const transaction = createDummyTransaction(wallets.blockedSender.address, wallets.targetB.address);

            await expect(
                sut.connect(wallets.bootloader).validateAndPayForPaymasterTransaction(hash, suggestedHash, transaction)
            ).to.be.revertedWithCustomError(sut, "BlockedSender");
        });

        it("Should revert if the to address is not allowed", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            const hash = hexlify(randomBytes(32));
            const suggestedHash = hexlify(randomBytes(32));
            const transaction = createDummyTransaction(wallets.targetA.address, wallets.blockedTarget.address);

            await expect(
                sut.connect(wallets.bootloader).validateAndPayForPaymasterTransaction(hash, suggestedHash, transaction)
            ).to.be.revertedWithCustomError(sut, "BlockedDestination");
        });

        it("Should revert if the paymaster input is too short", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            const hash = hexlify(randomBytes(32));
            const suggestedHash = hexlify(randomBytes(32));
            const transaction = createDummyTransaction(wallets.targetA.address, wallets.targetB.address, "0x8c5a34");

            await expect(
                sut.connect(wallets.bootloader).validateAndPayForPaymasterTransaction(hash, suggestedHash, transaction)
            ).to.be.revertedWithCustomError(sut, "InvalidPaymasterInput");
        });

        it("Should revert if the paymaster input is not IPaymasterFlow.general.selector", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            const hash = hexlify(randomBytes(32));
            const suggestedHash = hexlify(randomBytes(32));
            const transaction = createDummyTransaction(wallets.targetA.address, wallets.targetB.address, "0x8c5a3446");

            await expect(
                sut.connect(wallets.bootloader).validateAndPayForPaymasterTransaction(hash, suggestedHash, transaction)
            ).to.be.revertedWithCustomError(sut, "InvalidPaymasterInput");
        });

        it("Should send the bootloader _transaction.gasLimit * _transaction.maxFeePerGas", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            const bootloaderBalanceBefore = await ethers.provider.getBalance(wallets.bootloader.address);
            const sutBalanceBefore = await ethers.provider.getBalance(sut.target);

            const gasLimit = oneEther;
            const maxFeePerGas = 10n;

            const hash = hexlify(randomBytes(32));
            const suggestedHash = hexlify(randomBytes(32));
            const transaction = createDummyTransaction(
                wallets.targetA.address,
                wallets.targetB.address,
                generalSelector,
                gasLimit,
                maxFeePerGas
            );

            const tx = await sut
                .connect(wallets.bootloader)
                .validateAndPayForPaymasterTransaction(hash, suggestedHash, transaction);
            const receipt = await tx.wait();

            if (!receipt) {
                throw new Error("Transaction receipt is null");
            }

            const gasSpent = receipt.gasUsed * receipt.gasPrice;

            const expectedTransfer = gasLimit * maxFeePerGas;

            expect(await ethers.provider.getBalance(wallets.bootloader.address)).to.equal(
                bootloaderBalanceBefore + expectedTransfer - gasSpent
            );

            expect(await ethers.provider.getBalance(sut.target)).to.equal(sutBalanceBefore - expectedTransfer);
        });
    });

    describe("postTransaction", function () {
        it("Should revert if the caller is not the bootloader", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            const context = randomBytes(32);
            const transaction = createDummyTransaction(wallets.targetA.address, await sut.getAddress());
            const hash = hexlify(randomBytes(32));
            const suggestedHash = hexlify(randomBytes(32));
            const txResult = 1;
            const maxRefundedGas = oneEther;

            await expect(
                sut
                    .connect(wallets.targetA)
                    .postTransaction(context, transaction, hash, suggestedHash, txResult, maxRefundedGas)
            ).to.be.revertedWithCustomError(sut, "NotBootloader");
        });

        it("Should NOT revert if the caller is the bootloader", async function () {
            const { sut, wallets } = await loadFixture(fixture);

            const context = randomBytes(32);
            const transaction = createDummyTransaction(wallets.targetA.address, await sut.getAddress());
            const hash = hexlify(randomBytes(32));
            const suggestedHash = hexlify(randomBytes(32));
            const txResult = 1;
            const maxRefundedGas = oneEther;

            await expect(
                sut
                    .connect(wallets.bootloader)
                    .postTransaction(context, transaction, hash, suggestedHash, txResult, maxRefundedGas)
            ).to.not.be.reverted;
        });
    });
});
