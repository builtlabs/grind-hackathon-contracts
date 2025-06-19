import { HDNodeWallet } from "ethers";
import { ethers } from "hardhat";
import { vars } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { deploy, getProvider, getWeth, verifyAll } from "./helpers";
import { Deployer } from "@matterlabs/hardhat-zksync";
import { Wallet } from "zksync-ethers";

export default async function (runtime: HardhatRuntimeEnvironment) {
    console.log(`Running deploy script`, runtime.network.name);

    const isTestnet = runtime.network.name === "abstractTestnet";

    const privateKey = vars.get(isTestnet ? "DEV_PRIVATE_KEY" : "PK_HASHCRASH_PRIVATE");
    const seed = vars.get(isTestnet ? "DEV_SEED" : "SEED");

    const wallet = new Wallet(privateKey, getProvider(isTestnet));
    const deployer = new Deployer(runtime, wallet);

    const weth = getWeth(isTestnet);
    const hashProducer = getHashProducer(isTestnet);

    const fixedRTP10x = await deploy(deployer, "FixedRTP10x", []);

    const ethGenesisHash = getHash(getSalt(seed, 0, 0));
    const maxExposureNumerator = "100";
    const minLiquidityEth = ethers.parseEther("0.05").toString();
    const minValueEth = ethers.parseEther("0.001").toString();

    await deploy(deployer, "HashCrashNative", [
        fixedRTP10x.target,
        ethGenesisHash,
        hashProducer,
        maxExposureNumerator,
        minLiquidityEth,
        wallet.address,
        weth,
        minValueEth,
    ]);

    await verifyAll(runtime);
}

function getHashProducer(testnet: boolean): string {
    return testnet ? "0xc2bDed4B045bfdB5F051a13a55ed63FeEA45CB00" : "0x9b81Ec6F1Efa11d80835F2C1E8ae7fD46C522cdD";
}

function getHash(salt: string) {
    return ethers.keccak256(ethers.solidityPacked(["bytes32"], [salt]));
}

function getSalt(mnemonic: string, tokenIndex: number, roundIndex: number): string {
    const path = `m/44'/60'/${tokenIndex}'/0/${roundIndex}`;

    const wallet = HDNodeWallet.fromPhrase(mnemonic, undefined, path);

    return wallet.privateKey;
}
