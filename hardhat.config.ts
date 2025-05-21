import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
import "@matterlabs/hardhat-zksync";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
  },
  zksolc: {
    version: "latest",
    settings: {
      enableEraVMExtensions: true,
      codegen: "yul",
    },
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {},
    abstractTestnet: {
      url: "https://api.testnet.abs.xyz",
      ethNetwork: "sepolia",
      zksync: true,
      chainId: 11124,
    },
    abstractMainnet: {
      url: "https://api.mainnet.abs.xyz",
      ethNetwork: "mainnet",
      zksync: true,
      chainId: 2741,
    },
  },
  etherscan: {
    apiKey: {
      abstractTestnet: "TACK2D1RGYX9U7MC31SZWWQ7FCWRYQ96AD",
      abstractMainnet: "your-abscan-api-key-here",
    },
    customChains: [
      {
        network: "abstractTestnet",
        chainId: 11124,
        urls: {
          apiURL: "https://api-sepolia.abscan.org/api",
          browserURL: "https://sepolia.abscan.org/",
        },
      },
      {
        network: "abstractMainnet",
        chainId: 2741,
        urls: {
          apiURL: "https://api.abscan.org/api",
          browserURL: "https://abscan.org/",
        },
      },
    ],
  },
  mocha: {
    timeout: 1200000, // 20 minutes
  }
};

export default config;