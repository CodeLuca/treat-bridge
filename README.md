# TreatBridge

TreatBridge is a decentralized application (dApp) that allows users to bridge TREAT tokens across different blockchain networks. It currently supports Sepolia, BSC Testnet, and Polygon Amoy.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Features

- Bridge TREAT tokens between Sepolia, BSC Testnet, and Polygon Amoy
- Connect wallet using Rainbow Kit
- Estimate gas fees for bridging transactions
- Approve and bridge tokens in a user-friendly interface

## Prerequisites

- Node.js (v14 or later)
- npm or yarn
- MetaMask or another Web3 wallet

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/treat-bridge.git
   cd treat-bridge
   ```

2. Install dependencies:
   ```
   npm install
   ```
   or
   ```
   yarn install
   ```

3. Create a `.env` file in the root directory and add your environment variables:
   ```
   NEXT_PUBLIC_ALCHEMY_ID=your_alchemy_id
   NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_walletconnect_project_id
   ```

4. Start the development server:
   ```
   npm run dev
   ```
   or
   ```
   yarn dev
   ```

5. Open `http://localhost:3000` in your browser to view the app.

## Usage

1. Connect your wallet using the "Connect" button.
2. Select the source chain (From) and destination chain (To).
3. Enter the amount of TREAT tokens you want to bridge.
4. Click "Approve TREAT" to approve the token spending (if not already approved).
5. Once approved, click "Bridge Tokens" to initiate the bridging process.
6. Confirm the transaction in your wallet when prompted.

## Troubleshooting

### Common Issues
- **Insufficient balance**: Ensure you have enough TREAT tokens and native tokens for gas fees.
- **Network congestion**: During times of high network activity, transactions may take longer to process. Be patient and avoid submitting multiple transactions.
- **Wallet connection issues**: If you're having trouble connecting your wallet, try disconnecting and reconnecting, or use a different supported wallet.