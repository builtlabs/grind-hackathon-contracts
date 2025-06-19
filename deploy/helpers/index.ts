import { Deployer } from "@matterlabs/hardhat-zksync";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Contract, Provider } from "zksync-ethers";

interface Verify {
    address: string;
    constructorArguments: any[];
}

const toVerify: Verify[] = [];

export function getProvider(testnet: boolean): Provider {
    return new Provider(testnet ? "https://api.testnet.abs.xyz" : "https://api.mainnet.abs.xyz");
}

export function getWeth(testnet: boolean): string {
    const testnetWeth = "0x9EDCde0257F2386Ce177C3a7FCdd97787F0D841d";
    const mainnetWeth = "0x3439153EB7AF838Ad19d56E1571FBD09333C2809";

    return testnet ? testnetWeth : mainnetWeth;
}

export async function deploy(deployer: Deployer, contractName: string, args: any[] = []): Promise<Contract> {
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

export async function tx(transaction: Promise<any>) {
    await (await transaction).wait();
}

export async function verifyAll(runtime: HardhatRuntimeEnvironment) {
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

async function verify(runtime: HardhatRuntimeEnvironment, address: string, args: any[]) {
    await sleep(1000);
    return runtime.run("verify:verify", {
        address,
        constructorArguments: args,
    });
}

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
