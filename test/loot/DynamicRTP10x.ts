import { loadFixture, mine } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { randomBytes } from "crypto";
import { hexlify } from "ethers";
import fs from "fs";

const variableEvs = [
    85, 87, 89, 91, 92, 93, 94, 95, 95.5, 96, 96.5, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97,
    97, 97, 97, 97, 97,
];
const expectedLength = 33;

const log = true;
function logIfEnabled(...args: any[]) {
    if (log) {
        console.log(...args);
    }
}

describe("DynamicRTP10x", function () {
    async function fixture() {
        const [deployer] = await ethers.getSigners();

        const LOOT = await ethers.getContractFactory("DynamicRTP10x");
        const loot = await LOOT.deploy();
        await loot.waitForDeployment();

        const HARNESS = await ethers.getContractFactory("LootTableHarness");
        const harness = await HARNESS.deploy(loot.target);
        await harness.waitForDeployment();

        const length = await loot.getLength();
        expect(length).to.equal(expectedLength);

        const multipliers = await loot.getMultipliers();
        expect(multipliers.length).to.equal(expectedLength);

        const probabilities = await loot.getProbabilities();
        expect(probabilities.length).to.equal(expectedLength);

        function deadOn(rng: bigint[]) {
            const lengthN = Number(length);

            for (let i = 0; i < lengthN; i++) {
                if (rng[i] % BigInt(1e18) < probabilities[i]) {
                    return i;
                }
            }
            return lengthN;
        }

        return {
            harness,
            loot,
            wallet: deployer,

            local: {
                length: expectedLength,
                multipliers: multipliers.map((x) => Number(x) / 1e6),
                probabilities,
                deadOn,
            },
        };
    }

    // ############################ TESTS ############################

    describe("abstract block hashes", function () {
        it("Average EV should be around expected for raw block hashes", async function () {
            logIfEnabled("Running test with raw block hashes...");

            const {
                harness,
                local: { multipliers },
            } = await loadFixture(fixture);

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
                const deadOn = await harness.deadOn(rng);
                for (let j = 0; j < deadOn; j++) {
                    const current = visits.get(j) ?? 0;
                    visits.set(j, current + 1);
                }
            }

            const evs: number[] = [];

            for (const [key, value] of visits) {
                const ev = (value / precomputed.length) * multipliers[key] * 100;
                evs.push(ev);

                expect(ev).to.equal(
                    [
                        84.80329744279946, 86.67092866756394, 88.5699865410498, 90.57604306864063, 91.46971736204576,
                        92.42092866756393, 93.33580080753701, 94.10901749663526, 94.68371467025572, 95.53566621803499,
                        95.814266487214, 96.12382234185733, 96.55720053835802, 97.04979811574697, 96.77388963660836,
                        96.41722745625842, 96.68236877523555, 96.64703903095558, 97.18034993270525, 97.53532974427995,
                        97.38896366083446, 98.08546433378196, 97.40915208613727, 97.23082099596232, 96.94481830417227,
                        97.58748317631225, 98.21668909825033, 97.66150740242261, 98.0349932705249, 97.0693135935397,
                        96.78331090174966, 96.08681022880215, 96.09690444145357,
                    ][key]
                );

                expect(ev).to.be.greaterThan(variableEvs[key] - 1.5);
                expect(ev).to.be.lessThan(variableEvs[key] + 1.5);

                logIfEnabled(`Multiplier: ${multipliers[key]} Visits: ${value}, EV: ${ev}`);
            }

            const expectedEv = variableEvs.reduce((acc, curr) => acc + curr, 0) / variableEvs.length;
            const averageEv = evs.reduce((acc, curr) => acc + curr, 0) / evs.length;

            expect(averageEv).to.equal(95.25917043925119);
            expect(averageEv).to.be.greaterThan(expectedEv - 1);
            expect(averageEv).to.be.lessThan(expectedEv + 1);
            logIfEnabled(`Average EV: ${averageEv} (expected: ${expectedEv})`);
        });

        it("Average EV should be around expected for salted block hashes", async function () {
            logIfEnabled("Running test with salted block hashes...");

            const {
                harness,
                local: { multipliers },
            } = await loadFixture(fixture);

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
                const deadOn = await harness.deadOn(rng);
                for (let j = 0; j < deadOn; j++) {
                    const current = visits.get(j) ?? 0;
                    visits.set(j, current + 1);
                }
            }

            const evs: number[] = [];

            for (const [key, value] of visits) {
                const ev = (value / precomputed.length) * multipliers[key] * 100;
                evs.push(ev);

                expect(ev).to.equal(
                    [
                        84.92563930013459, 86.96769851951548, 89.14737550471065, 90.94751009421265, 91.84118438761776,
                        92.81628532974429, 93.69448183041723, 94.43876177658142, 95.00672947510094, 95.21366083445491,
                        95.91117092866756, 96.31224764468371, 96.4535666218035, 96.67833109017496, 97.15881561238223,
                        96.75639300134588, 97.02557200538358, 96.42833109017495, 95.9555854643338, 96.12213997308208,
                        96.36608344549124, 96.87415881561239, 96.90444145356662, 96.82368775235531, 96.25841184387617,
                        96.23149394347242, 95.10767160161508, 95.03701211305517, 94.58950201884252, 95.52489905787348,
                        95.57200538358008, 95.76716016150739, 95.69313593539704,
                    ][key]
                );

                expect(ev).to.be.greaterThan(variableEvs[key] - 2.5);
                expect(ev).to.be.lessThan(variableEvs[key] + 2.5);

                logIfEnabled(`Multiplier: ${multipliers[key]} Visits: ${value}, EV: ${ev}`);
            }

            const expectedEv = variableEvs.reduce((acc, curr) => acc + curr, 0) / variableEvs.length;
            const averageEv = evs.reduce((acc, curr) => acc + curr, 0) / evs.length;

            expect(averageEv).to.equal(94.74397406093233);
            expect(averageEv).to.be.greaterThan(expectedEv - 1);
            expect(averageEv).to.be.lessThan(expectedEv + 1);
            logIfEnabled(`Average EV: ${averageEv} (expected: ${expectedEv})`);
        });
    });

    // NOTE: This test is slow (about 20-30 minutes), so it's skipped by default.
    describe.skip("random large sample size (SLOW, remove skip to run)", function () {
        it("Should produce the expected ev on chain", async function () {
            logIfEnabled("Running test on chain with random large sample size...");

            const {
                harness,
                local: { length, multipliers },
            } = await loadFixture(fixture);

            const iterations = 100000;
            const visits = new Map<number, number>();

            for (let i = 0; i < iterations; i++) {
                const rng = Array.from({ length }, () => BigInt(hexlify(randomBytes(32))));

                const deadOn = await harness.deadOn(rng);
                for (let j = 0; j < deadOn; j++) {
                    const current = visits.get(j) ?? 0;
                    visits.set(j, current + 1);
                }
            }

            const evs: number[] = [];

            for (const [key, value] of visits) {
                const ev = (value / iterations) * multipliers[key] * 100;

                const expectedEv = variableEvs[key];
                expect(ev).to.be.greaterThan(expectedEv - 2);
                expect(ev).to.be.lessThan(expectedEv + 2);

                evs.push(ev);

                logIfEnabled(`Multiplier: ${multipliers[key]} Visits: ${value}, EV: ${ev}`);
            }

            const expectedEv = variableEvs.reduce((acc, curr) => acc + curr, 0) / variableEvs.length;
            const averageEv = evs.reduce((acc, curr) => acc + curr, 0) / evs.length;
            expect(averageEv).to.be.greaterThan(expectedEv - 1);
            expect(averageEv).to.be.lessThan(expectedEv + 1);

            logIfEnabled(`Average EV: ${averageEv} (expected: ${expectedEv})`);
        });

        it("Should produce the expected ev locally", async function () {
            logIfEnabled("Running test locally with random large sample size...");

            const {
                local: { length, multipliers, deadOn: localDeadOn },
            } = await loadFixture(fixture);

            const iterations = 1000000;
            const visits = new Map<number, number>();

            for (let i = 0; i < iterations; i++) {
                const rng = Array.from({ length }, () => BigInt(hexlify(randomBytes(32))));

                const deadOn = localDeadOn(rng);
                for (let j = 0; j < deadOn; j++) {
                    const current = visits.get(j) ?? 0;
                    visits.set(j, current + 1);
                }
            }

            const evs: number[] = [];

            for (const [key, value] of visits) {
                const ev = (value / iterations) * multipliers[key] * 100;

                const expectedEv = variableEvs[key];
                expect(ev).to.be.greaterThan(expectedEv - 1);
                expect(ev).to.be.lessThan(expectedEv + 1);

                evs.push(ev);
                logIfEnabled(`Multiplier: ${multipliers[key]} Visits: ${value}, EV: ${ev}`);
            }

            const expectedEv = variableEvs.reduce((acc, curr) => acc + curr, 0) / variableEvs.length;
            const averageEv = evs.reduce((acc, curr) => acc + curr, 0) / evs.length;
            expect(averageEv).to.be.greaterThan(expectedEv - 0.5);
            expect(averageEv).to.be.lessThan(expectedEv + 0.5);

            logIfEnabled(`Average EV: ${averageEv} (expected: ${expectedEv})`);
        });
    });
});
