import { loadFixture, mine } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

const oneEther = ethers.parseEther("1");
const initialBalance = ethers.parseEther("100");

const knownRandoms = [
    "0x283b8dccf28774e4a044d565a03369ff0c07898f65ae91230915f2ba1437981d",
    "0xeaf524133e8d9a0f1a969c83af27fb013166dfc8c9e66392e0f2f83a9b635e51",
    "0x96a8a21bcd09432f88ad64788fc68b8db463e5a9f2d6a8a3ee754449c55c91c9",
    "0x4b1dc1dd9db96919105a6ce350ddab528b8e84db161cbd03044123f16bb20147",
    "0x53f1f5ab12de6c1ad3106d99e253e3e5308ab8ab880fb3ec4bc216a4129f596b",
    "0xe9c8038c3fb6e756f3482d07a25cffd382371b9e2d876ebe8047b83f6f1311a7",
    "0xbb9daeafd51606c745a53d003f5569b049b90e045b69994194ab9b97491ca553",
    "0x11865b4f8fb6aedf6d515f0cef844a6ed6305599ddbca02bc845add62a3662f9",
    "0xc3ea3bb417eab918590f50d0c1c28637a6925c1ab097ae6e4c2136888090b50c",
    "0x031331d4d1ecc343cbd321e273a813edd486286619837ce9e405efe73e1137bc",
    "0xac7a1c7e2c8d7badb1bbfa5e93b4f53c5b35a116fa81e3690015338c14e5e6d0",
    "0x985d72f78b3e79c3ff7ab1a858b64c6f71cd29f3dfc61cc07edd29eb1f57dff6",
    "0x47d44da38a5ca7cc7d93e3039d36baaec3de5750bd9239c9cfe1bbdbfb925db6",
    "0x8bd1a84c6c1219d92929c1d7e74a1a7e1911ff4d730c54796f2dafbc8878168f",
    "0xf7d013a07e8ad65d4961d4eaa7cf48c83d81db998cceefa11fd4efa8f8ac2b04",
    "0x7fa8ab17cfa10836fbc8d52417e6e2b9ca41faa55e4798b3fa681ed465ee0fba",
    "0xed20edecf4b0168c24bcd84e00417dad5c950f85a4ff73ad070cc21396c9227e",
    "0xde208f54438603e6853d5e78e896d001682b0a287f57e7256ecfb340cc49499f",
    "0xefdd05aeb0b4c285499c6022168b7c68607456a5069eced86ae7cf5ef1b713ed",
    "0x763e7e48c39bf05e6bcd6338a3ca650546a7ef23f7a245fde75482a08fa9ab90",
    "0x461bc1dd2f94c4a3fd832653f088212b85a12e95ac8420e6d289e1264bad5731",
    "0x1a6e08a9d27692e88b20c391621bcb1fab8a432143a41c221cc03ae31fc6e568",
    "0x2f2473b554f9897ae1bb4c7be2c0db6c8cd1ec232df3ad19fbd6883039c670e0",
    "0x8312e2a60bbae1c7b0e2dbb22de3108c3365647cd278618a0b798d3db6453040",
    "0x97c78cf56002d6cefe3a404f09a51384bc8bc069e1ad633416f8a3685f3b801d",
    "0x300f927202a376b4015f335f61a7f804d73f469d757789b416e8c908e466d346",
    "0x63f01b566b136ad4c0807b31bfee9548c67ba591f4206d174fe78390fe1d90ef",
    "0x7f424af7b21e77eee730939d951a516922bbe3a23a31c349526eaf4c4fae5c77",
    "0x0c3b7a91d1701901f4758d8df235a0327e4022c9144a5e1b2684143ef8c31724",
    "0x4847355acd881baa66e08c8f36326cfcb8935dd867b7a54fce93f25bc8df1b6f",
    "0x8f139e7a06aac85dbf7542172846a82999cba85ab318e8e09e686a2fec6095e0",
    "0x4cd5a71c71186a340d9c2f1cdc9fa59777c9987e5a04d6a51a3726308f8ca626",
    "0xa7f4e50208fd712d885270a36e1a75f1626b5770c24e67be3f55352821af4e6e",
    "0x39dcb8521f994e069b501a479b32864146be6ba1ae39d80beef720f2ecab4830",
    "0x3117e2f82af4c1e805d700881720032d385e47226c2173e04ac9dffd2ba941db",
    "0x59041a1806ca4cdb7d2d7d590d34b677b2dbd54ad6cf1e9fc98415d47eefdde2",
    "0xb054c9f06e2a2ac7509d297320bafaea87153fe014e55c726ec4b3942f6eeddd",
    "0x70fc827e96d00dea2136214bc3762b63d23a7cd45c4f35be6a16c8075021a546",
    "0x1aa0a79eaf6ab3a8a9cda608428e01b9d41fbb91698e9b5d0cb9cca9b24dac3d",
    "0x5c4f38c1888836188f85094cf568f0eb4ed155fd6c932e32bbf9ce0e4900349e",
    "0x59bed028b906b8aa43bd1678de655e9dc72530ce15dad34d834e24fe7a3a22ac",
    "0x4e50bd088322fdf3a69bd564d6c40b87de29e3225481cbbd1ec91ecd57971f1a",
    "0x44779e756b687acfcaa46310a281054d508385ba5cc02898adcf8dd5c1fe774e",
    "0x127d2ed5a6f61e9b247c0bb80db1319bf2284e0ee3f91147de2d20284d3ceda1",
    "0xb8d6244764dae4fef11390554eadc94ce95fb229882ef24ee6cf5bef96199b43",
    "0x54beae8cd25221ee29c227b094256b19fb8f76892fd4780badaee631a07ff6df",
    "0x1840470562d84e3b072cef7162f3f76807e74c24b73286d97629e5adb8cc3d3e",
    "0x3306e52a1cc9138008f3052d26c4008d7df1e32e463ed4c148d3f938a1bb140a",
    "0xb660016ae02df58327d581305fb8c59a763381148817dccbd038ca4a1bcb22fc",
    "0x3ba538d72ae8fb75e45683696e03a85d10b73ff70746fa10703b0b9762a28ee3",
];

describe("HashCrash", function () {
    async function baseFixture() {
        const [deployer, alice, bob, charlie] = await ethers.getSigners();

        const GRIND = await ethers.getContractFactory("Grind");
        const grind = await GRIND.deploy();
        await grind.waitForDeployment();

        const HASHCRASH = await ethers.getContractFactory("HashCrashHarness");
        const sut = await HASHCRASH.deploy(grind.target);

        for (const wallet of [alice, bob, charlie]) {
            await grind.connect(wallet).mint();
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

    async function liquidFixture() {
        const fixture = await baseFixture();
        const { sut, grind, wallets } = fixture;

        await grind.connect(wallets.alice).approve(sut.target, initialBalance);
        await grind.connect(wallets.bob).approve(sut.target, initialBalance);
        await grind.connect(wallets.charlie).approve(sut.target, initialBalance);

        await grind.approve(sut.target, initialBalance);
        await sut.queueLiquidityChange(0, initialBalance);

        await sut.reset();

        return fixture;
    }

    async function knownGameFixture() {
        const fixture = await liquidFixture();
        const { sut } = fixture;

        const offset = await sut.ROUND_BUFFER();

        const block = await ethers.provider.getBlock("latest");
        if (!block) throw new Error("Block not found");

        const mocks = knownRandoms.map((x, i) => {
            return {
                blockNumber: BigInt(block.number + i) + offset,
                randomNumber: BigInt(x),
            };
        });

        await sut.setMockRandom(mocks);

        return fixture;
    }

    async function maxGameFixture() {
        const fixture = await liquidFixture();
        const { sut } = fixture;

        const offset = await sut.ROUND_BUFFER();

        const block = await ethers.provider.getBlock("latest");
        if (!block) throw new Error("Block not found");

        const mocks = Array.from({ length: 100 }, (_, i) => {
            return {
                blockNumber: BigInt(block.number + i) + offset,
                randomNumber: ethers.parseEther("1.999"),
            };
        });

        await sut.setMockRandom(mocks);

        return fixture;
    }

    // ############################ TESTS ############################

    describe("integration", function () {
        it.skip("Should produce the expected tally", async function () {
            const { sut, grind } = await loadFixture(baseFixture);

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

            const total = 5000;
            const tally: Record<number, number> = {};

            for (let i = 0; i < total; i++) {
                await sut.placeBet(ethers.parseEther("0.01"), 49n);

                await mine(100);

                await sut.reset();
            }

            const history = await sut.getHistory(total);

            for (const multi of history) {
                const keyIndex = multipliers.findIndex((x) => x === parseFloat(multi.toString()));

                for (let i = 0; i <= keyIndex; i++) {
                    tally[multipliers[i]] = (tally[multipliers[i]] || 0) + 1;
                }
            }

            let evs: number[] = [];

            for (const entries of Object.entries(tally)) {
                const [key, value] = entries;

                const multi = parseFloat(key) / 1e6;
                const ev = (value / total) * multi;

                if (multi >= 1) {
                    expect(ev).to.be.closeTo(0.97, 0.15);
                    evs.push(ev);
                } else {
                    expect(ev).to.be.lessThan(0.97);
                }

                console.log("ev", multi, (value / total) * multi);
            }

            const avg = evs.reduce((a, b) => a + b, 0) / evs.length;
            console.log("average ev", avg);

            expect(avg).to.be.lessThan(1).greaterThan(0.9);
        });

        it("Plays as expected", async function () {
            const { sut, wallets, grind } = await loadFixture(knownGameFixture);

            await sut.connect(wallets.alice).placeBet(oneEther, 10); // winner (6x)
            await sut.connect(wallets.bob).placeBet(oneEther, 11); // dead on
            await sut.connect(wallets.charlie).placeBet(oneEther, 12); // dead after

            await mine(100);

            const round = await sut.getRoundInfo();

            expect(round.sb).to.equal(33n);
            expect(round.eb).to.equal(44n);
            expect(round.lq).to.equal(
                (initialBalance * 40n) / 100n -
                    (oneEther * 6000000n) / 1000000n -
                    (oneEther * 7000000n) / 1000000n -
                    (oneEther * 9000000n) / 1000000n
            );

            await sut.reset();

            const history = await sut.getHistory(1);

            expect(history[0]).to.equal(6000000n);
            expect(await grind.balanceOf(wallets.alice.address)).to.equal(initialBalance - oneEther + 6n * oneEther);
            expect(await grind.balanceOf(wallets.bob.address)).to.equal(initialBalance - oneEther);
            expect(await grind.balanceOf(wallets.charlie.address)).to.equal(initialBalance - oneEther);
            expect(await grind.balanceOf(sut.target)).to.equal(initialBalance + oneEther * 3n - oneEther * 6n);
        });
    });

    describe("constructor", function () {
        it("Should set the grind address", async function () {
            const { sut, grind } = await loadFixture(baseFixture);

            expect(await sut.GRIND()).to.equal(await grind.getAddress());
        });
    });

    describe("placeBet", function () {
        it("Should revert if the amount is 0", async function () {
            const { sut } = await loadFixture(liquidFixture);

            await expect(sut.placeBet(0, 0)).to.be.revertedWithCustomError(sut, "ZeroAmountError");
        });

        it("Should start the game if _roundStartBlock is 0", async function () {
            const { sut, wallets } = await loadFixture(liquidFixture);

            const block = await ethers.provider.getBlock("latest");
            const offset = await sut.ROUND_BUFFER();

            await sut.connect(wallets.alice).placeBet(oneEther, 4);

            const game = await sut.getRoundInfo();

            expect(game.sb).to.equal(BigInt(block!.number) + offset + 1n);
        });

        it("Should revert if the autoCashout is above the max allowed limit", async function () {
            const { sut, wallets } = await loadFixture(liquidFixture);

            const length = await sut.ROUND_LENGTH();

            await expect(sut.connect(wallets.alice).placeBet(oneEther, length)).to.be.revertedWithCustomError(
                sut,
                "InvalidCashoutError"
            );
        });

        it("Should revert if the block is the start block", async function () {
            const { sut, wallets } = await loadFixture(liquidFixture);

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
            const { sut, wallets } = await loadFixture(liquidFixture);

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
            const { sut, grind, wallets } = await loadFixture(liquidFixture);

            const sutBefore = await grind.balanceOf(sut.target);
            const aliceBefore = await grind.balanceOf(wallets.alice.address);

            await sut.connect(wallets.alice).placeBet(oneEther, 4);

            const sutAfter = await grind.balanceOf(sut.target);
            const aliceAfter = await grind.balanceOf(wallets.alice.address);

            expect(sutAfter).to.equal(sutBefore + oneEther);
            expect(aliceAfter).to.equal(aliceBefore - oneEther);
        });

        it("Should not revert if the max possible win is the round lq", async function () {
            const { sut, wallets } = await loadFixture(liquidFixture);

            await expect(sut.connect(wallets.alice).placeBet(oneEther, 25)).to.not.be.revertedWithCustomError(
                sut,
                "BetTooLargeError"
            );
        });

        it("Should revert if the max possible win is greater than the round lq", async function () {
            const { sut, wallets } = await loadFixture(liquidFixture);

            await expect(sut.connect(wallets.alice).placeBet(oneEther, 26)).to.be.revertedWithCustomError(
                sut,
                "BetTooLargeError"
            );
        });

        it("Should decrement the round lq", async function () {
            const { sut, wallets } = await loadFixture(liquidFixture);

            const before = await sut.getRoundInfo();

            await sut.connect(wallets.alice).placeBet(oneEther, 5); // 2x

            const after = await sut.getRoundInfo();

            expect(after.lq).to.equal(before.lq - oneEther * 2n);
        });

        it("Should store the bet", async function () {
            const { sut, wallets } = await loadFixture(liquidFixture);

            await sut.connect(wallets.alice).placeBet(oneEther, 4);

            const bets = await sut.getBets();
            const aliceBets = await sut.getBetsFor(wallets.alice.address);

            expect(bets.length).to.equal(1);
            expect(bets[0].user).to.equal(wallets.alice.address);
            expect(bets[0].amount).to.equal(oneEther);
            expect(bets[0].cashoutIndex).to.equal(4n);
            expect(bets[0].cancelled).to.equal(false);

            expect(aliceBets.length).to.equal(1);
            expect(aliceBets[0].user).to.equal(wallets.alice.address);
            expect(aliceBets[0].amount).to.equal(oneEther);
            expect(aliceBets[0].cashoutIndex).to.equal(4n);
            expect(aliceBets[0].cancelled).to.equal(false);
        });
    });

    describe("cancelBet", function () {
        it("Should revert if the bet doesnt exist", async function () {
            const { sut } = await loadFixture(liquidFixture);

            await expect(sut.cancelBet(0)).to.be.reverted;
        });

        it("Should revert if the bet isnt yours", async function () {
            const { sut, wallets } = await loadFixture(liquidFixture);

            await sut.connect(wallets.alice).placeBet(oneEther, 4);

            await expect(sut.connect(wallets.bob).cancelBet(0)).to.be.revertedWithCustomError(sut, "NotYourBetError");
        });

        it("Should revert if the bet was cancelled", async function () {
            const { sut, wallets } = await loadFixture(liquidFixture);

            await sut.connect(wallets.alice).placeBet(oneEther, 4);
            await sut.connect(wallets.alice).cancelBet(0);

            await expect(sut.connect(wallets.alice).cancelBet(0)).to.be.revertedWithCustomError(sut, "NotYourBetError");
        });

        it("Should revert on the start block", async function () {
            const { sut, wallets } = await loadFixture(liquidFixture);

            await sut.connect(wallets.alice).placeBet(oneEther, 4);

            const offset = await sut.ROUND_BUFFER();
            await mine(offset - 1n);

            const block = await ethers.provider.getBlock("latest");
            expect(BigInt(block!.number)).to.equal((await sut.getRoundInfo()).sb - 1n);

            await expect(sut.connect(wallets.alice).cancelBet(0)).to.be.revertedWithCustomError(
                sut,
                "RoundStartedError"
            );
        });

        it("Should revert after the start block", async function () {
            const { sut, wallets } = await loadFixture(liquidFixture);

            await sut.connect(wallets.alice).placeBet(oneEther, 4);

            const offset = await sut.ROUND_BUFFER();
            await mine(offset);

            const block = await ethers.provider.getBlock("latest");
            expect(BigInt(block!.number)).to.equal((await sut.getRoundInfo()).sb);

            await expect(sut.connect(wallets.alice).cancelBet(0)).to.be.revertedWithCustomError(
                sut,
                "RoundStartedError"
            );
        });

        it("Should set cancelled to true", async function () {
            const { sut, wallets } = await loadFixture(liquidFixture);

            await sut.connect(wallets.alice).placeBet(oneEther, 4n);
            await sut.connect(wallets.alice).cancelBet(0);

            const bets = await sut.getBetsFor(wallets.alice.address);

            expect(bets[0].cancelled).to.equal(true);
        });

        it("Should return the funds", async function () {
            const { sut, grind, wallets } = await loadFixture(liquidFixture);

            const sutBefore = await grind.balanceOf(sut.target);
            const aliceBefore = await grind.balanceOf(wallets.alice.address);

            await sut.connect(wallets.alice).placeBet(oneEther, 4n);
            await sut.connect(wallets.alice).cancelBet(0);

            expect(await grind.balanceOf(sut.target)).to.equal(sutBefore);
            expect(await grind.balanceOf(wallets.alice.address)).to.equal(aliceBefore);
        });

        it("Should restore the round liquidity", async function () {
            const { sut, wallets } = await loadFixture(liquidFixture);

            const before = await sut.getRoundInfo();

            await sut.connect(wallets.alice).placeBet(oneEther, 4n);
            await sut.connect(wallets.alice).cancelBet(0);

            const after = await sut.getRoundInfo();

            expect(after.lq).to.equal(before.lq);
        });
    });

    describe("cashEarly", function () {
        it("Should revert if the bet doesn't exist", async function () {
            const { sut } = await loadFixture(knownGameFixture);

            await expect(sut.cashEarly(0)).to.be.reverted;
        });

        it("Should revert if the bet isn't yours", async function () {
            const { sut, wallets } = await loadFixture(knownGameFixture);

            await sut.connect(wallets.alice).placeBet(oneEther, 4);

            await expect(sut.connect(wallets.bob).cashEarly(0)).to.be.revertedWithCustomError(sut, "NotYourBetError");
        });

        it("Should revert if the bet was cancelled", async function () {
            const { sut, wallets } = await loadFixture(knownGameFixture);

            await sut.connect(wallets.alice).placeBet(oneEther, 4);
            await sut.connect(wallets.alice).cancelBet(0);

            await expect(sut.connect(wallets.alice).cashEarly(0)).to.be.revertedWithCustomError(sut, "NotYourBetError");
        });

        it("Should revert if the game hasn't started yet", async function () {
            const { sut, wallets } = await loadFixture(knownGameFixture);

            await sut.connect(wallets.alice).placeBet(oneEther, 4);

            await expect(sut.connect(wallets.alice).cashEarly(0)).to.be.revertedWithCustomError(
                sut,
                "RoundNotStartedError"
            );
        });

        it("Should revert if the block is beyond the users cashout", async function () {
            const { sut, wallets } = await loadFixture(knownGameFixture);

            await sut.connect(wallets.alice).placeBet(oneEther, 4);

            await mine(25);

            await expect(sut.connect(wallets.alice).cashEarly(0)).to.be.revertedWithCustomError(sut, "RoundOverError");
        });

        it("Should revert if the round is over", async function () {
            const { sut, wallets } = await loadFixture(knownGameFixture);

            await sut.connect(wallets.alice).placeBet(oneEther, 15);

            await mine(34);

            await expect(sut.connect(wallets.alice).cashEarly(0)).to.be.revertedWithCustomError(sut, "RoundOverError");
        });

        it("Should update the cashoutIndex", async function () {
            const { sut, wallets } = await loadFixture(knownGameFixture);

            const offset = await sut.ROUND_BUFFER();
            const newIndex = 6n;

            await sut.connect(wallets.alice).placeBet(ethers.parseEther("0.01"), 45);

            await mine(offset + newIndex - 1n);

            await sut.connect(wallets.alice).cashEarly(0);

            const bets = await sut.getBetsFor(wallets.alice.address);

            expect(bets[0].cashoutIndex).to.equal(newIndex);
        });
    });

    describe("reset", function () {
        describe("_resetRound", function () {
            it("Should revert if a move has been made", async function () {
                const { sut, wallets } = await loadFixture(knownGameFixture);

                await sut.connect(wallets.alice).placeBet(oneEther, 4);

                await expect(sut.reset()).to.be.revertedWithCustomError(sut, "RoundNotOverError");
            });

            it("Should revert if the block is the start block", async function () {
                const { sut, wallets } = await loadFixture(knownGameFixture);

                const offset = await sut.ROUND_BUFFER();

                await sut.connect(wallets.alice).placeBet(oneEther, 4);

                await mine(offset - 1n);

                await expect(sut.reset()).to.be.revertedWithCustomError(sut, "RoundNotOverError");

                const block = await ethers.provider.getBlock("latest");
                expect(BigInt(block!.number)).to.equal((await sut.getRoundInfo()).sb);
            });

            it("Should not revert on the death block", async function () {
                const { sut, wallets } = await loadFixture(knownGameFixture);

                const offset = await sut.ROUND_BUFFER();

                await sut.connect(wallets.alice).placeBet(oneEther, 4);

                await mine(offset + 10n);
                await expect(sut.reset()).to.be.revertedWithCustomError(sut, "RoundNotOverError");

                await mine(1n);
                await expect(sut.reset()).to.not.be.reverted;
            });

            it("Should not revert after the max win", async function () {
                const { sut, wallets } = await loadFixture(maxGameFixture);

                await sut.connect(wallets.alice).placeBet(oneEther, 4);

                await mine(100n);

                await expect(sut.reset()).to.not.be.reverted;
            });

            it("Should be callable by anyone", async function () {
                const { sut, wallets } = await loadFixture(liquidFixture);

                await sut.connect(wallets.alice).placeBet(oneEther, 4);

                await mine(100);

                await expect(sut.connect(wallets.alice).reset()).to.not.be.reverted;
            });

            it("Should push the multiplier to the history", async function () {
                const { sut, wallets } = await loadFixture(knownGameFixture);

                await sut.connect(wallets.alice).placeBet(oneEther, 4);

                await mine(100);

                await sut.reset();

                const history = await sut.getHistory(1);
                expect(history[0]).to.equal(6000000n);
            });

            it("Should push the max multiplier to the history", async function () {
                const { sut, wallets } = await loadFixture(maxGameFixture);

                await sut.connect(wallets.alice).placeBet(oneEther, 4);

                await mine(100);

                await sut.reset();

                const history = await sut.getHistory(1);
                expect(history[0]).to.equal(100000000n);
            });

            it("Should set the round start block to 0", async function () {
                const { sut, wallets } = await loadFixture(liquidFixture);

                await sut.connect(wallets.alice).placeBet(oneEther, 4);

                await mine(100);

                await sut.reset();

                const game = await sut.getRoundInfo();
                expect(game.sb).to.equal(0n);
            });

            describe("_processBets", function () {
                it("Should ignore a cancelled bet", async function () {
                    const { sut, grind, wallets } = await loadFixture(knownGameFixture);

                    await sut.connect(wallets.alice).placeBet(oneEther, 10);
                    await sut.connect(wallets.alice).cancelBet(0);

                    await mine(100);

                    const info = await sut.getRoundInfo();

                    await sut.reset();

                    expect(info.eb - info.sb).to.equal(11);

                    expect(await grind.balanceOf(wallets.alice.address)).to.equal(initialBalance);
                    expect(await grind.balanceOf(sut.target)).to.equal(initialBalance);
                });

                it("Should ignore a bet on the dead block", async function () {
                    const { sut, grind, wallets } = await loadFixture(knownGameFixture);

                    await sut.connect(wallets.alice).placeBet(oneEther, 11);

                    await mine(100);

                    const info = await sut.getRoundInfo();

                    await sut.reset();

                    expect(info.eb - info.sb).to.equal(11);

                    expect(await grind.balanceOf(wallets.alice.address)).to.equal(initialBalance - oneEther);
                    expect(await grind.balanceOf(sut.target)).to.equal(initialBalance + oneEther);
                });

                it("Should ignore a bet after the dead block", async function () {
                    const { sut, grind, wallets } = await loadFixture(knownGameFixture);

                    await sut.connect(wallets.alice).placeBet(oneEther, 12);

                    await mine(100);

                    const info = await sut.getRoundInfo();

                    await sut.reset();

                    expect(info.eb - info.sb).to.equal(11);

                    expect(await grind.balanceOf(wallets.alice.address)).to.equal(initialBalance - oneEther);
                    expect(await grind.balanceOf(sut.target)).to.equal(initialBalance + oneEther);
                });

                it("Should payout a winning bet", async function () {
                    const { sut, grind, wallets } = await loadFixture(knownGameFixture);

                    await sut.connect(wallets.alice).placeBet(oneEther, 10);

                    await mine(100);

                    const info = await sut.getRoundInfo();

                    await sut.reset();

                    expect(info.eb - info.sb).to.equal(11);

                    expect(await grind.balanceOf(wallets.alice.address)).to.equal(initialBalance + oneEther * 5n);
                    expect(await grind.balanceOf(sut.target)).to.equal(initialBalance - oneEther * 5n);
                });

                it("Should delete all bets", async function () {
                    const { sut, wallets } = await loadFixture(knownGameFixture);

                    await sut.connect(wallets.alice).placeBet(oneEther, 4);
                    await sut.connect(wallets.bob).placeBet(oneEther, 4);
                    await sut.connect(wallets.charlie).placeBet(oneEther, 4);

                    await mine(100);

                    expect((await sut.getBets()).length).to.equal(3);

                    await sut.reset();

                    expect((await sut.getBets()).length).to.equal(0);
                });
            });
        });

        describe("_processLiquidityQueue", function () {
            it("Should ignore an invalid add when the caller has no funds", async function () {
                const { sut, wallets } = await loadFixture(baseFixture);

                await sut.connect(wallets.alice).queueLiquidityChange(0, initialBalance + oneEther);
                await sut.reset();

                const lq = await sut.getLiquidityQueue();
                expect(lq.length).to.equal(0);

                expect(await sut.getTotalShares()).to.equal(0);
                expect(await sut.getShares(wallets.alice)).to.equal(0);
            });

            it("Should ignore an invalid add when the caller has no allowance", async function () {
                const { sut, wallets } = await loadFixture(baseFixture);

                await sut.connect(wallets.alice).queueLiquidityChange(0, oneEther);
                await sut.reset();

                const lq = await sut.getLiquidityQueue();
                expect(lq.length).to.equal(0);

                expect(await sut.getTotalShares()).to.equal(0);
                expect(await sut.getShares(wallets.alice)).to.equal(0);
            });

            it("Should ignore an invalid remove", async function () {
                const { sut, wallets } = await loadFixture(baseFixture);

                await sut.queueLiquidityChange(1, oneEther);
                await sut.reset();

                const lq = await sut.getLiquidityQueue();
                expect(lq.length).to.equal(0);

                expect(await sut.getTotalShares()).to.equal(0);
                expect(await sut.getShares(wallets.deployer)).to.equal(0);
            });

            it("Should add liquidity", async function () {
                const { sut, grind, wallets } = await loadFixture(baseFixture);

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
                const { sut, grind, wallets } = await loadFixture(baseFixture);

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
                const { sut, grind, wallets } = await loadFixture(baseFixture);

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
                const { sut, grind, wallets } = await loadFixture(baseFixture);

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
                const { sut, grind, wallets } = await loadFixture(baseFixture);

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
                const { sut, grind, wallets } = await loadFixture(baseFixture);

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
                const { sut, grind, wallets } = await loadFixture(baseFixture);

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
                await grind.transfer(sut.target, initialBalance); // 100 extra tokens, for 10 shares

                for (const remove of removes) {
                    await sut
                        .connect(remove.wallet)
                        .queueLiquidityChange(1, await sut.getShares(remove.wallet.address));
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

            it("Should allow for removed tokens", async function () {
                const { sut, grind, wallets } = await loadFixture(baseFixture);

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
                    await grind.connect(add.wallet).approve(sut.target, initialBalance);
                    await sut.connect(add.wallet).queueLiquidityChange(0, add.amount);
                }

                await sut.reset();

                expect(await sut.getTotalShares()).to.equal(10n * oneEther);
                expect(await grind.balanceOf(sut.target)).to.equal(10n * oneEther);

                await sut.mockLoss(5n * oneEther); // Half the tokens

                for (const remove of removes) {
                    await sut
                        .connect(remove.wallet)
                        .queueLiquidityChange(1, await sut.getShares(remove.wallet.address));
                }

                await sut.reset();

                const lq = await sut.getLiquidityQueue();
                expect(lq.length).to.equal(0);

                expect(await sut.getTotalShares()).to.equal(0);
                expect(await grind.balanceOf(sut.target)).to.equal(0);

                for (const remove of removes) {
                    expect(await sut.getShares(remove.wallet)).to.equal(0);
                    expect(await grind.balanceOf(remove.wallet.address)).to.equal(initialBalance - remove.amount);
                }
            });
        });
    });

    describe("queueLiquidityChange", function () {
        it("Should revert if the amount is zero", async function () {
            const { sut } = await loadFixture(baseFixture);

            await expect(sut.queueLiquidityChange(0, 0)).to.be.revertedWithCustomError(sut, "ZeroAmountError");
        });

        it("Should revert if the action is greater than 1", async function () {
            const { sut } = await loadFixture(baseFixture);

            await expect(sut.queueLiquidityChange(2, oneEther)).to.be.revertedWithCustomError(
                sut,
                "InvalidActionError"
            );
        });

        it("Should push to the LQ", async function () {
            const { sut, wallets } = await loadFixture(baseFixture);

            const tx = await sut.queueLiquidityChange(0, oneEther);
            await tx.wait();

            const lq = await sut.getLiquidityQueue();

            expect(lq.length).to.equal(1);
            expect(lq[0].user).to.equal(wallets.deployer.address);
            expect(lq[0].amount).to.equal(oneEther);
            expect(lq[0].action).to.equal(0);
        });

        it("Should emit the LiquidityChangeQueued event", async function () {
            const { sut, wallets } = await loadFixture(baseFixture);

            await expect(sut.queueLiquidityChange(0, oneEther))
                .to.emit(sut, "LiquidityChangeQueued")
                .withArgs(0, wallets.deployer.address, oneEther);
        });
    });
});
