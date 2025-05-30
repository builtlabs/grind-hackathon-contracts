import { ethers } from "hardhat";
import { vars } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Contract, HDNodeWallet } from "ethers";

import { Wallet } from "zksync-ethers";
import { Deployer } from "@matterlabs/hardhat-zksync";

const initialBalance = ethers.parseEther("100000");

interface Verify {
    address: string;
    constructorArguments: any[];
}

const revealer = "0xc2bDed4B045bfdB5F051a13a55ed63FeEA45CB00";

const toVerify: Verify[] = [];

export default async function (runtime: HardhatRuntimeEnvironment) {
    console.log(`Running deploy script`, runtime.network.name);

    const wallet = new Wallet(vars.get(runtime.network.name === "abstractTestnet" ? "DEV_PRIVATE_KEY" : "PRIVATE_KEY"));
    const deployer = new Deployer(runtime, wallet);

    console.log(`Using wallet: ${wallet.address}`);

    const seed = vars.get(runtime.network.name === "abstractTestnet" ? "DEV_SEED" : "SEED");

    const ethGenesisHash = getHash(getSalt(seed, 0, 0));

    const linear10x = await deploy(deployer, "Linear10x", []);

    const hashCrash = await deploy(deployer, "HashCrashNative", [
        linear10x.target,
        ethGenesisHash,
        revealer,
        wallet.address,
    ]);

    await tx(hashCrash.setActive(true));

    if (runtime.network.name === "abstractTestnet") {
        const grindGenesisHash = getHash(getSalt(seed, 1, 0));

        const linear100x = await deploy(deployer, "Linear100x", []);

        const grind = await deploy(deployer, "DemoERC20", []);

        const grindCrash = await deploy(deployer, "HashCrashERC20", [
            linear100x.target,
            grindGenesisHash,
            revealer,
            wallet.address,
            grind.target,
        ]);

        await tx(grind.mint(wallet.address, initialBalance));
        await tx(grind.approve(await grindCrash.getAddress(), initialBalance));
        await tx(grindCrash.deposit(initialBalance));
        await tx(grindCrash.setActive(true));
    }

    await sleep(90000);

    console.log(`Verifying contracts...`);
    for (const item of toVerify) {
        try {
            await verify(runtime, item.address, item.constructorArguments);
            console.log(`Verified ${item.address}`);
        } catch (error) {
            console.error(`Failed to verify ${item.address}:`, error);
        }
    }
}

async function deploy(deployer: Deployer, contractName: string, args: any[] = []): Promise<Contract> {
    const Artifact = await deployer.loadArtifact(contractName);
    const contract = await deployer.deploy(Artifact, args);
    await contract.waitForDeployment();

    const address = await contract.getAddress();

    toVerify.push({
        address: address,
        constructorArguments: args,
    });

    console.log(`${Artifact.contractName} was deployed to ${address}`);

    return contract;
}

async function tx(transaction: Promise<any>) {
    await (await transaction).wait();
}

async function verify(runtime: HardhatRuntimeEnvironment, address: string, args: any[]) {
    await sleep(1000);
    return runtime.run("verify:verify", {
        address,
        constructorArguments: args,
    });
}

function getHash(salt: string) {
    return ethers.keccak256(ethers.solidityPacked(["bytes32"], [salt]));
}

function getSalt(mnemonic: string, tokenIndex: number, roundIndex: number): string {
    const path = `m/44'/60'/${tokenIndex}'/0/${roundIndex}`;

    const wallet = HDNodeWallet.fromPhrase(mnemonic, undefined, path);

    return wallet.privateKey;
}

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
