import { ethers } from "hardhat";
import { vars } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Contract, HDNodeWallet } from "ethers";

import { Provider, Wallet } from "zksync-ethers";
import { Deployer } from "@matterlabs/hardhat-zksync";

interface Verify {
    address: string;
    constructorArguments: any[];
}

const testnetWeth = "0x9EDCde0257F2386Ce177C3a7FCdd97787F0D841d";
const mainnetWeth = "0x3439153EB7AF838Ad19d56E1571FBD09333C2809";

const revealer = "0xc2bDed4B045bfdB5F051a13a55ed63FeEA45CB00";
const platform = "0x25bbEDE914021Fdb13B57d9866bB370965d015c1";

const toVerify: Verify[] = [];

export default async function (runtime: HardhatRuntimeEnvironment) {
    console.log(`Running deploy script`, runtime.network.name);

    const zkProvider = new Provider("https://api.testnet.abs.xyz");

    const weth = runtime.network.name === "abstractTestnet" ? testnetWeth : mainnetWeth;

    const wallet = new Wallet(vars.get(runtime.network.name === "abstractTestnet" ? "DEV_PRIVATE_KEY" : "PRIVATE_KEY"), zkProvider);
    const deployer = new Deployer(runtime, wallet);

    console.log(`Using wallet: ${wallet.address}`);

    const seed = vars.get(runtime.network.name === "abstractTestnet" ? "DEV_SEED" : "SEED");
    const ethGenesisHash = getHash(getSalt(seed, 0, 0));

    const platformInterface = await deploy(deployer, "PlatformInterface", [platform, weth, wallet.address]);
    const fixedRTP10x = await deploy(deployer, "FixedRTP10x", []);

    const minLiquidityEth = ethers.parseEther("0.01").toString();
    const hashCrash = await deploy(deployer, "HashCrashNative", [
        fixedRTP10x.target,
        ethGenesisHash,
        revealer,
        "1000", // TODO: maxExposureNumerator_
        minLiquidityEth,
        wallet.address,
        weth,
        ethers.parseEther("0.001").toString(), // TODO: Min amount
    ]);

    await tx(hashCrash.deposit("0", { value: ethers.parseEther("0.2") }));
    await tx(hashCrash.setActive(true));

    const gamemodes = [hashCrash.target];

    if (runtime.network.name === "abstractTestnet") {
        const grindGenesisHash = getHash(getSalt(seed, 1, 0));

        const fixedRTP100x = await deploy(deployer, "FixedRTP100x", []);

        const grind = await deploy(deployer, "DemoERC20", []);

        const minLiquidityGrind = ethers.parseEther("1000").toString();
        const grindCrash = await deploy(deployer, "HashCrashERC20", [
            fixedRTP100x.target,
            grindGenesisHash,
            revealer,
            "1000", // TODO: maxExposureNumerator_
            minLiquidityGrind,
            wallet.address,
            grind.target,
            ethers.parseEther("10").toString(), // TODO: Min amount
        ]);

        gamemodes.push(grindCrash.target);

        const initialBalance = ethers.parseEther("100000");
        await tx(grind.mint(wallet.address, initialBalance));
        await tx(grind.approve(await grindCrash.getAddress(), initialBalance));
        await tx(grindCrash.deposit(initialBalance));
        await tx(grindCrash.setActive(true));
    }

    const paymaster = await deploy(deployer, "GeneralPaymaster", [wallet.address]);
    await tx(
        wallet.sendTransaction({
            to: paymaster.target,
            value: ethers.parseEther("0.1"),
        })
    );

    await tx(platformInterface.startSeason(gamemodes));

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
