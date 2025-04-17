import hre from "hardhat";
import { ethers } from "hardhat";
import { vars } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { Wallet } from "zksync-ethers";
import { Deployer } from "@matterlabs/hardhat-zksync";

const initialBalance = ethers.parseEther("100000");

export default async function (hre: HardhatRuntimeEnvironment) {
    console.log(`Running deploy script`, hre.network.name);

    const wallet = new Wallet(vars.get(hre.network.name === "abstractTestnet" ? "DEV_PRIVATE_KEY" : "PRIVATE_KEY"));

    const deployer = new Deployer(hre, wallet);

    const GRIND = await deployer.loadArtifact("Grind");
    const HASHCRASH = await deployer.loadArtifact("HashCrash");

    const grind = await deployer.deploy(GRIND);
    await grind.waitForDeployment();

    const grindAddress = await grind.getAddress();

    const hashCrash = await deployer.deploy(HASHCRASH, [grindAddress]);
    await hashCrash.waitForDeployment();

    const hashCrashAddress = await hashCrash.getAddress();

    await tx(grind.approve(hashCrashAddress, initialBalance));
    await tx(hashCrash.queueLiquidityChange(0, initialBalance));
    await tx(hashCrash.reset());
    await tx(grind.mint());

    console.log(`${GRIND.contractName} was deployed to ${grindAddress}`);
    console.log(`${HASHCRASH.contractName} was deployed to ${hashCrashAddress}`);

    await sleep(20000);

    await verify(grindAddress, []);
    await verify(hashCrashAddress, [grindAddress]);
}

async function tx(transaction: Promise<any>) {
    await (await transaction).wait();
}

async function verify(address: string, args: any[]) {
    await sleep(1000);
    return hre.run("verify:verify", {
        address,
        constructorArguments: args,
    });
}

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
