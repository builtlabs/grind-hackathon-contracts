import { Wallet } from "zksync-ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync";
import { vars } from "hardhat/config";
import { ethers } from "hardhat";

const runner = "0xc2bDed4B045bfdB5F051a13a55ed63FeEA45CB00";

const initialBalance = ethers.parseEther("100000");

export default async function (hre: HardhatRuntimeEnvironment) {
  console.log(`Running deploy script`, hre.network.name);

  const wallet = new Wallet(vars.get(hre.network.name === "abstractTestnet" ? "DEV_PRIVATE_KEY" : "PRIVATE_KEY"));

  const deployer = new Deployer(hre, wallet);

  const GRIND = await deployer.loadArtifact("Grind");
  const BLOCKCRASH = await deployer.loadArtifact("BlockCrash");
  
  const grind = await deployer.deploy(GRIND);
  await grind.waitForDeployment();

  const grindAddress = await grind.getAddress();

  const blockCrash = await deployer.deploy(BLOCKCRASH, [grindAddress, runner]);
  await blockCrash.waitForDeployment();
  
  const blockCrashAddress = await blockCrash.getAddress();

  await tx(grind.approve(blockCrashAddress, initialBalance));
  await tx(blockCrash.queueLiquidityChange(0, initialBalance));
  await tx(blockCrash.reset());
  await tx(grind.mint());

  console.log(
    `${
      GRIND.contractName
    } was deployed to ${grindAddress}`
  );

  console.log(
    `${
      BLOCKCRASH.contractName
    } was deployed to ${blockCrashAddress}`
  );
}

async function tx(transaction: Promise<any>) {
  await (await transaction).wait();
}
