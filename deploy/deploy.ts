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

    const isTestnet = runtime.network.name === "abstractTestnet";

    const privateKey = vars.get("DEV_PRIVATE_KEY") // TODO: Split
    const seed = vars.get( "DEV_SEED"); // TODO: Split

    const providerURL = isTestnet ? "https://api.testnet.abs.xyz" : "https://api.mainnet.abs.xyz"
    const weth = isTestnet ? testnetWeth : mainnetWeth;

    const zkProvider = new Provider(providerURL);
    const wallet = new Wallet(privateKey, zkProvider);
    const deployer = new Deployer(runtime, wallet);

    console.log(`Using wallet: ${wallet.address}`);

    const ethGenesisHash = getHash(getSalt(seed, 0, 0));
    const maxExposureNumerator = "100"; // 1%

    const platformInterface = await deploy(deployer, "PlatformInterface", [platform, weth, wallet.address]);
    const fixedRTP10x = await deploy(deployer, "FixedRTP10x", []);

    const minLiquidityEth = ethers.parseEther("0.01").toString();
    const minValueEth = ethers.parseEther("0.001").toString();

    const hashCrashNative = await deploy(deployer, "HashCrashNative", [
        fixedRTP10x.target,
        ethGenesisHash,
        revealer,
        maxExposureNumerator,
        minLiquidityEth,
        wallet.address,
        weth,
        minValueEth,
    ]);

    const gamemodes = [hashCrashNative.target];

    const fakeGenesisHash = getHash(getSalt(seed, 1, 0));
    const fakeEth = await deploy(deployer, "DemoERC20", []);

    const hashCrashFake = await deploy(deployer, "HashCrashERC20", [
        fixedRTP10x.target,
        fakeGenesisHash,
        revealer,
        maxExposureNumerator,
        minLiquidityEth,
        wallet.address,
        fakeEth.target,
        minValueEth
    ]);

    gamemodes.push(hashCrashFake.target);

    const initialBalance = ethers.parseEther("100");
    await tx(fakeEth.mint(wallet.address, initialBalance));
    await tx(fakeEth.approve(await hashCrashFake.getAddress(), initialBalance));
    await tx(hashCrashFake.deposit(initialBalance));
    await tx(hashCrashFake.setActive(true));

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
