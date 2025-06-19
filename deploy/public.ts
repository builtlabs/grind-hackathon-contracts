import { vars } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { deploy, getProvider, getWeth, verifyAll } from "./helpers";
import { Wallet } from "zksync-ethers";
import { Deployer } from "@matterlabs/hardhat-zksync";

export default async function (runtime: HardhatRuntimeEnvironment) {
    console.log(`Running deploy script`, runtime.network.name);

    const isTestnet = runtime.network.name === "abstractTestnet";
    const privateKey = vars.get(isTestnet ? "DEV_PRIVATE_KEY" : "PK_HASHCRASH_PUBLIC")

    const wallet = new Wallet(privateKey, getProvider(isTestnet));
    const deployer = new Deployer(runtime, wallet);
    
    const weth = getWeth(isTestnet);
    const feeCollector = getPlatformFeeCollector(isTestnet);

    await deploy(deployer, "PlatformInterface", [feeCollector, weth, wallet.address]);
    await deploy(deployer, "GeneralPaymaster", [wallet.address]);

    await verifyAll(runtime);
}

function getPlatformFeeCollector(testnet: boolean): string {
    return testnet ? "0x25bbEDE914021Fdb13B57d9866bB370965d015c1" : "0xc41Fbb7538dD5a74E76390d7878E3F6d245Bf5EA";
}