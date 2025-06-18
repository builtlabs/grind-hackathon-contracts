import { ethers } from "hardhat";
import { vars } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Contract, HDNodeWallet } from "ethers";
import { abi as PlatformInterfaceABI } from "../artifacts/contracts/auxiliary/PlatformInterface.sol/PlatformInterface.json";
import { abi as HashCrashERC20ABI } from "../artifacts/contracts/implementations/HashCrashERC20.sol/HashCrashERC20.json";
import { abi as DemoERC20ABI } from "../artifacts/contracts/test/DemoERC20.sol/DemoERC20.json";

import { abi as MaliciousBetterABI } from "../artifacts/contracts/test/MaliciousBetter.sol/MaliciousBetter.json";
import { abi as MaliciousLiquidityProviderABI } from "../artifacts/contracts/test/MaliciousLiquidityProvider.sol/MaliciousLiquidityProvider.json";

import { Provider, Wallet } from "zksync-ethers";
import { Deployer } from "@matterlabs/hardhat-zksync";

interface Verify {
    address: string;
    constructorArguments: any[];
}

const _MAX_BET_QUEUE_SIZE = 256n;
const _MAX_LIQUIDITY_QUEUE_SIZE = 64n;

const toVerify: Verify[] = [];

export default async function (runtime: HardhatRuntimeEnvironment) {
    console.log(`Running deploy script`, runtime.network.name);

    const isTestnet = runtime.network.name === "abstractTestnet";

    const privateKey = vars.get("DEV_PRIVATE_KEY") // TODO: Split
    const providerURL = isTestnet ? "https://api.testnet.abs.xyz" : "https://api.mainnet.abs.xyz"

    const zkProvider = new Provider(providerURL);
    const wallet = new Wallet(privateKey, zkProvider);
    const deployer = new Deployer(runtime, wallet);

    const hashcrash = new Contract("0x5B5e7DA825b6d421274b5E74402A660fAa8fdd49", HashCrashERC20ABI, wallet);
    const token = new Contract("0x96d639AeE20361D7E3672Eb0880a0ca3e94EabF2", DemoERC20ABI, wallet);

    // const noDeath = await deploy(deployer, "NoDeathTable");
    // await tx(hashcrash.setLootTable(noDeath.target));

    // await tx(hashcrash.setIntroBlocks(20));
    // await tx(hashcrash.setLowLiquidityThreshold(ethers.parseEther("0.1")));
    // await tx(hashcrash.setLootTable("0xc22059aEa47b61df5a099b8A97165eA1066Dc4B3"));

    // const maliciousBetter = await deploy(deployer, "MaliciousBetter");
    // const maliciousLiquidityProvider = await deploy(deployer, "MaliciousLiquidityProvider");

    // const minimum = await hashcrash.getMinimum();
    // const batchSize = 64n;

    // await tx(token.mint(maliciousLiquidityProvider.target, minimum * _MAX_LIQUIDITY_QUEUE_SIZE));

    // console.log("Depositing liquidity...");

    // let remaining = _MAX_LIQUIDITY_QUEUE_SIZE;
    // let startIndex = 0n;
    // while (remaining > 0n) {
    //     const deposits = remaining > batchSize ? batchSize : remaining;
    //     await tx(maliciousLiquidityProvider.multiDeposit(hashcrash.target, token.target, deposits, startIndex));
    //     remaining -= deposits;
    //     startIndex += deposits;
    //     console.log(`Deposited ${deposits} liquidity, remaining: ${remaining}`);
    // }

    // await tx(token.mint(maliciousBetter.target, minimum * _MAX_BET_QUEUE_SIZE));

    // console.log("Starting to bet...");

    // remaining = _MAX_BET_QUEUE_SIZE;
    // while (remaining > 0n) {
    //     const bets = remaining > batchSize ? batchSize : remaining;
    //     await tx(maliciousBetter.multiBet(hashcrash.target, token.target, bets, minimum, 0));
    //     remaining -= bets;
    //     console.log(`Bet ${bets} tokens, remaining: ${remaining}`);
    // }

    // console.log("Trying to withdraw...");

    // remaining = _MAX_LIQUIDITY_QUEUE_SIZE;
    // startIndex = 0n;
    // while (remaining > 0n) {
    //     const withdraws = remaining > batchSize ? batchSize : remaining;
    //     await tx(maliciousLiquidityProvider.multiWithdraw(hashcrash.target, withdraws, startIndex));
    //     remaining -= withdraws;
    //     startIndex += withdraws;
    //     console.log(`Withdrew ${withdraws} liquidity, remaining: ${remaining}`);
    // }

    // console.log("DONMEEEEEE");
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
