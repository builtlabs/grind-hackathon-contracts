import { loadFixture, mine } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { randomBytes } from "crypto";
import { hexlify } from "ethers";
import fs from "fs";

const oneEther = ethers.parseEther("1");

const multipliers = [
    1.01, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.4, 1.5, 2, 2.2, 2.4, 2.6, 2.8, 3.0, 3.25, 3.5, 4.0, 4.5, 5, 6, 7, 8, 9, 10,
    12, 14, 16, 18, 20, 22.5, 25, 27.5, 30, 32.5, 35, 37.5, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
];

describe("LinearLootTable", function () {
    async function fixture() {
        const [deployer] = await ethers.getSigners();

        const SUT = await ethers.getContractFactory("LinearLootTableHarness");
        const sut = await SUT.deploy();

        return {
            sut,
            wallet: deployer,
        };
    }

    // ############################ TESTS ############################

    describe("multiply", function () {
        it("Should revert if the index is greater than 49", async function () {
            const { sut } = await loadFixture(fixture);

            await expect(sut.multiply(0n, 50)).to.be.revertedWithCustomError(sut, "InvalidIndexError");
        });

        it("Should apply the given multipliers", async function () {
            const { sut } = await loadFixture(fixture);

            const scale = 10000n;

            for (let i = 0; i < multipliers.length; i++) {
                expect(await sut.multiply(scale, i)).to.equal(BigInt(Math.floor(Number(scale) * multipliers[i])));
            }
        });
    });

    describe("isDead", function () {
        it("Should revert when the index is greater than 49", async function () {
            const { sut } = await loadFixture(fixture);

            await expect(sut.isDead(0n, 50)).to.be.revertedWithCustomError(sut, "InvalidIndexError");
        });

        it("Should return true when the rng is always lowers than the probability", async function () {
            const { sut } = await loadFixture(fixture);

            const rng = 1n;

            for (let i = 0; i < 50; i++) {
                expect(await sut.isDead(rng, i)).to.be.true;
            }
        });

        it("Should return false when the rng is always greater than the probability", async function () {
            const { sut } = await loadFixture(fixture);

            const rng = oneEther - 1n;

            for (let i = 0; i < 50; i++) {
                expect(await sut.isDead(rng, i)).to.be.false;
            }
        });
    });

    // NOTE: Despite taking around 750k block hashes, this is a tiny sample size, so only checking the average
    describe("abstract block hashes", function () {
        it("Average EV should be around 97% for raw block hashes", async function () {
            const { sut } = await loadFixture(fixture);

            const precomputed = JSON.parse(
                fs.readFileSync("test/_helpers/rawBlockHashes.json", "utf-8"),
                (_key, value) => {
                    if (typeof value === "string" && /^\d+$/.test(value)) {
                        try {
                            return BigInt(value);
                        } catch {
                            return value;
                        }
                    }
                    return value;
                }
            ) as bigint[][];

            const visits = new Map<number, number>();

            for (const rng of precomputed) {
                const deadOn = await sut.deadOn(rng);
                for (let j = 0; j < deadOn; j++) {
                    const current = visits.get(j) ?? 0;
                    visits.set(j, current + 1);
                }
            }

            const evs: number[] = [];

            for (const [key, value] of visits) {
                evs.push((value / precomputed.length) * multipliers[key] * 100);
            }

            const averageEv = evs.reduce((acc, curr) => acc + curr, 0) / evs.length;

            expect(averageEv).to.be.greaterThan(96);
            expect(averageEv).to.be.lessThan(98);
        });

        it("Average EV should be around 97% for salted block hashes", async function () {
            const { sut } = await loadFixture(fixture);

            const precomputed = JSON.parse(
                fs.readFileSync("test/_helpers/saltedBlockHashes.json", "utf-8"),
                (_key, value) => {
                    if (typeof value === "string" && /^\d+$/.test(value)) {
                        try {
                            return BigInt(value);
                        } catch {
                            return value;
                        }
                    }
                    return value;
                }
            ) as bigint[][];

            const visits = new Map<number, number>();

            for (const rng of precomputed) {
                const deadOn = await sut.deadOn(rng);
                for (let j = 0; j < deadOn; j++) {
                    const current = visits.get(j) ?? 0;
                    visits.set(j, current + 1);
                }
            }

            const evs: number[] = [];

            for (const [key, value] of visits) {
                evs.push((value / precomputed.length) * multipliers[key] * 100);
            }

            const averageEv = evs.reduce((acc, curr) => acc + curr, 0) / evs.length;

            expect(averageEv).to.be.greaterThan(95);
            expect(averageEv).to.be.lessThan(100);
        });
    });

    // NOTE: This test is slow (about 20-30 minutes), so it's skipped by default.
    describe.skip("local random large sample size (SLOW, remove skip to run)", function () {
        it("Should produce the expected ev on chain", async function () {
            const { sut } = await loadFixture(fixture);

            const iterations = 500000;
            const visits = new Map<number, number>();

            for (let i = 0; i < iterations; i++) {
                const rng = Array.from({ length: 50 }, () => BigInt(hexlify(randomBytes(32))));

                const deadOn = await sut.deadOn(rng);
                for (let j = 0; j < deadOn; j++) {
                    const current = visits.get(j) ?? 0;
                    visits.set(j, current + 1);
                }
            }

            const evs: number[] = [];

            for (const [key, value] of visits) {
                const ev = (value / iterations) * multipliers[key] * 100;

                expect(ev).to.be.greaterThan(94);
                expect(ev).to.be.lessThan(100);

                evs.push(ev);
            }

            const averageEv = evs.reduce((acc, curr) => acc + curr, 0) / evs.length;
            expect(averageEv).to.be.greaterThan(96);
            expect(averageEv).to.be.lessThan(98);
        });

        it("Should produce the expected ev locally", async function () {
            const iterations = 5000000;
            const visits = new Map<number, number>();

            for (let i = 0; i < iterations; i++) {
                const rng = Array.from({ length: 50 }, () => BigInt(hexlify(randomBytes(32))));

                const deadOn = localDeadOn(rng);
                for (let j = 0; j < deadOn; j++) {
                    const current = visits.get(j) ?? 0;
                    visits.set(j, current + 1);
                }
            }

            const evs: number[] = [];

            for (const [key, value] of visits) {
                const ev = (value / iterations) * multipliers[key] * 100;

                expect(ev).to.be.greaterThan(96);
                expect(ev).to.be.lessThan(98);

                evs.push(ev);
            }

            const averageEv = evs.reduce((acc, curr) => acc + curr, 0) / evs.length;
            expect(averageEv).to.be.greaterThan(96.5);
            expect(averageEv).to.be.lessThan(97.5);
        });
    });
});

const localDeadOn = (rng: bigint[]) => {
    for (let i = 0; i < 50; i++) {
        if (isDead(rng[i], i)) {
            return i;
        }
    }
    return 50;
};

function isDead(rng: bigint, _index: number) {
    return rng % BigInt(1e18) < _probability(_index);
}

function _probability(_index: number) {
    return [
        39603960396039640n,
        38095238095238130n,
        45454545454545490n,
        43478260869565096n,
        41666666666666664n,
        39999999999999980n,
        38461538461538616n,
        71428571428571330n,
        66666666666666720n,
        249999999999999940n,
        90909090909090860n,
        83333333333333330n,
        76923076923076930n,
        71428571428571464n,
        66666666666666870n,
        76923076923076740n,
        71428571428571400n,
        125000000000000200n,
        111111111111111100n,
        100000000000000000n,
        166666666666666660n,
        142857142857142660n,
        125000000000000200n,
        111111111111111100n,
        100000000000000000n,
        166666666666666660n,
        142857142857142660n,
        124999999999999410n,
        111111111111111920n,
        100000000000000000n,
        111111111111111100n,
        100000000000001040n,
        90909090909090640n,
        83333333333332540n,
        76923076923076400n,
        71428571428572500n,
        66666666666664530n,
        62500000000001610n,
        111111111111111100n,
        100000000000001040n,
        90909090909087790n,
        83333333333335440n,
        76923076923076400n,
        71428571428568776n,
        66666666666668270n,
        62499999999997310n,
        58823529411769550n,
        55555555555555016n,
        52631578947370590n,
        49999999999993470n,
    ][_index];
}
