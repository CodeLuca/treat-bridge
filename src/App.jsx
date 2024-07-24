import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useChainId, useBalance, useReadContract, useSwitchChain, usePublicClient } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { ConnectButton } from '@rainbow-me/rainbowkit';

// Import your OFT ABI
import oftAbi from './oftAbi.json';

// ERC20 ABI (only the functions we need)
const erc20Abi = [
  {
    constant: false,
    inputs: [
      { name: '_spender', type: 'address' },
      { name: '_value', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function'
  },
  {
    constant: true,
    inputs: [
      { name: '_owner', type: 'address' },
      { name: '_spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function'
  }
];

const chainConfigs = {
  11155111: { // Sepolia
    name: 'Sepolia',
    contractAddress: '0x845f1be42fdbf9f285bf1278256b6627543f51dd',
    icon: '🔵',
    lzChainId: 10161,
  },
  97: { // BSC Testnet
    name: 'BSC Testnet',
    contractAddress: '0xdE637209AC5E70fA2F2B6C86684E860fd474A33E',
    icon: '🟡',
    lzChainId: 10102,
  },
  80002: { // Amoy
    name: 'Polygon Amoy',
    contractAddress: '0x845f1be42fdbf9f285bf1278256b6627543f51dd',
    icon: '🟣',
    lzChainId: 10109,
  }
};

const TreatBridge = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();

  const [fromChain, setFromChain] = useState(chainConfigs[chainId] || chainConfigs[11155111]);
  const [toChain, setToChain] = useState(chainConfigs[97]);
  const [amount, setAmount] = useState('');
  const [isApproved, setIsApproved] = useState(false);
  const [estimatedGas, setEstimatedGas] = useState(BigInt(0));
  const [error, setError] = useState(null);
  const [txHash, setTxHash] = useState(null);

  const { writeContract: writeApproveContract, isLoading: isApproveLoading, isSuccess: isApproveSuccess } = useWriteContract();
  const { writeContract: writeBridgeContract, isLoading: isBridgeLoading, isSuccess: isBridgeSuccess } = useWriteContract();

  // Fetch balance for the current 'from' chain
  const { data: balance, isLoading: isBalanceLoading } = useBalance({
    address,
    token: fromChain.contractAddress,
    chainId: Number(Object.keys(chainConfigs).find(key => chainConfigs[key] === fromChain)),
  });

  // Check allowance
  const { data: allowance, isLoading: isAllowanceLoading } = useReadContract({
    address: fromChain.contractAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, fromChain.contractAddress] : undefined,
    chainId: Number(Object.keys(chainConfigs).find(key => chainConfigs[key] === fromChain)),
    enabled: !!address && !!fromChain.contractAddress,
  });

  // Fallback gas estimation
  const estimateGasFallback = async () => {
    try {
      const gasPrice = await publicClient.getGasPrice();
      // Estimate a higher gas limit as a safety margin
      const estimatedGasLimit = BigInt(300000); // You may need to adjust this value
      return gasPrice * estimatedGasLimit;
    } catch (error) {
      console.error('Error in fallback gas estimation:', error);
      return BigInt(0);
    }
  };

  // Estimate gas
  useEffect(() => {
    const estimateGas = async () => {
      if (!address || !amount || !fromChain.contractAddress || !toChain.lzChainId) return;

      try {
        const result = await publicClient.readContract({
          address: fromChain.contractAddress,
          abi: oftAbi,
          functionName: 'estimateSendFee',
          args: [
            BigInt(toChain.lzChainId),
            address,
            parseEther(amount || '0'),
            false,
            '0x'
          ],
        });

        if (result && Array.isArray(result) && result.length > 0) {
          console.log('Estimated fees:', result[0]);
          setEstimatedGas(result[0]);
        } else {
          throw new Error('Invalid estimation result');
        }
      } catch (err) {
        console.error('Gas estimation error:', err);
        // Use fallback estimation
        const fallbackEstimate = await estimateGasFallback();
        setEstimatedGas(fallbackEstimate);
      }
    };

    estimateGas();
  }, [address, amount, fromChain, toChain, publicClient]);

  useEffect(() => {
    console.log('Chain ID changed:', chainId);
    if (chainId && chainConfigs[chainId]) {
      setFromChain(chainConfigs[chainId]);
      // Set toChain to a different chain
      const otherChains = Object.values(chainConfigs).filter(chain => chain.name !== chainConfigs[chainId].name);
      setToChain(otherChains[Math.floor(Math.random() * otherChains.length)]);
    }
  }, [chainId]);

  useEffect(() => {
    console.log('Allowance or amount changed:', { allowance, amount });
    if (allowance && amount) {
      const isNowApproved = allowance >= parseEther(amount || '0');
      console.log('Is now approved:', isNowApproved);
      setIsApproved(isNowApproved);
    }
  }, [allowance, amount]);

  const handleFromChainChange = (newChainId) => {
    console.log('Handling from chain change:', newChainId);
    const newFromChain = chainConfigs[newChainId];
    setFromChain(newFromChain);
    // Update toChain to ensure it's different from the new fromChain
    const otherChains = Object.values(chainConfigs).filter(chain => chain.name !== newFromChain.name);
    setToChain(otherChains[Math.floor(Math.random() * otherChains.length)]);
    if (switchChain) {
      console.log('Switching chain to:', Number(newChainId));
      switchChain(Number(newChainId));
    }
  };

  const handleApprove = async () => {
    console.log('Handling approve');
    if (!address || !amount || !isConnected) {
      console.log('Approve conditions not met:', { address, amount, isConnected });
      return;
    }

    try {
      setError(null);
      console.log('Approving tokens:', {
        address: fromChain.contractAddress,
        spender: fromChain.contractAddress,
        amount: parseEther(amount)
      });
      const result = await writeApproveContract({
        address: fromChain.contractAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [fromChain.contractAddress, parseEther(amount)],
      });
      console.log('Approve result:', result);
      if (result && result.hash) {
        setTxHash(result.hash);
        console.log('Approve transaction hash:', result.hash);
      } else {
        console.error('No transaction hash in approve result:', result);
        throw new Error('No transaction hash received for approve');
      }
    } catch (err) {
      console.error("Error approving tokens:", err);
      setError(err.message || "An error occurred while approving tokens");
    }
  };

  const handleBridge = async () => {
    console.log('Handling bridge');
    if (!address || !amount || !isConnected || !isApproved) {
      console.log('Bridge conditions not met:', { address, amount, isConnected, isApproved });
      return;
    }

    try {
      setError(null);
      console.log('Bridging tokens:', {
        address: fromChain.contractAddress,
        abi: oftAbi,
        functionName: 'sendFrom',
        args: [
          address,
          BigInt(toChain.lzChainId),
          address,
          parseEther(amount),
          address,
          '0x0000000000000000000000000000000000000000',
          '0x'
        ],
        value: estimatedGas,
      });
      const result = await writeBridgeContract({
        address: fromChain.contractAddress,
        abi: oftAbi,
        functionName: 'sendFrom',
        args: [
          address,
          BigInt(toChain.lzChainId),
          address,
          parseEther(amount),
          address,
          '0x0000000000000000000000000000000000000000',
          '0x'
        ],
        value: estimatedGas,
      });
      console.log('Bridge result:', result);
      if (result && result.hash) {
        setTxHash(result.hash);
        console.log('Bridge transaction hash:', result.hash);
      } else {
        console.error('No transaction hash in bridge result:', result);
        throw new Error('No transaction hash received for bridge');
      }
    } catch (err) {
      console.error("Error bridging tokens:", err);
      setError(err.message || "An error occurred while bridging tokens");
    }
  };

  const handleSwapChains = () => {
    console.log('Swapping chains');
    setToChain(fromChain);
    handleFromChainChange(Object.keys(chainConfigs).find(key => chainConfigs[key] === toChain));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-200 to-pink-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 space-y-6 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center text-pink-600">Treat Bridge</h1>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">From</label>
            <select
              value={fromChain.name}
              onChange={(e) => handleFromChainChange(Object.keys(chainConfigs).find(key => chainConfigs[key].name === e.target.value))}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm rounded-md"
            >
              {Object.values(chainConfigs).map((chain) => (
                <option key={chain.name} value={chain.name}>{chain.icon} {chain.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSwapChains}
            className="mx-auto block text-2xl text-pink-600 hover:text-pink-700 transition-colors"
          >
            ⇅
          </button>

          <div>
            <label className="block text-sm font-medium text-gray-700">To</label>
            <select
              value={toChain.name}
              onChange={(e) => {
                const selected = Object.values(chainConfigs).find(c => c.name === e.target.value);
                if (selected) setToChain(selected);
              }}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm rounded-md"
            >
              {Object.values(chainConfigs).map((chain) => (
                <option key={chain.name} value={chain.name}>{chain.icon} {chain.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Amount</label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <input
                type="text"
                value={amount}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '' || /^\d*\.?\d*$/.test(value)) {
                    setAmount(value);
                  }
                }}
                placeholder="0.0"
                className="focus:ring-pink-500 focus:border-pink-500 block w-full pl-3 pr-20 sm:text-sm border-gray-300 rounded-md"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">TREAT</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 px-4 py-3 rounded-md">
            <h2 className="text-sm font-medium text-gray-700">Your TREAT Balance</h2>
            <p className="mt-1 text-xl font-semibold text-gray-900">
              {isBalanceLoading ? 'Loading...' :
                balance ? `${parseFloat(formatEther(balance.value)).toFixed(4)} TREAT` : 'N/A'}
            </p>
          </div>
          <div className="bg-gray-50 px-4 py-2 rounded-md">
            <h2 className="text-xs font-medium text-gray-700">Estimated Gas Fee</h2>
            <p className="mt-1 text-sm font-semibold text-gray-900">
              {estimatedGas === BigInt(0) ? 'Calculating...' :
                `${parseFloat(formatEther(estimatedGas)).toFixed(6)} ETH`}
            </p>
          </div>
        </div>

        <div className="pt-4">
          {!isConnected ? (
            <ConnectButton />
          ) : !isApproved ? (
            <button
              onClick={handleApprove}
              disabled={isApproveLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isApproveLoading ? 'Approving...' : 'Approve TREAT'}
            </button>
          ) : (
            <button
              onClick={handleBridge}
              disabled={isBridgeLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 disabled:opacity-50"
            >
              {isBridgeLoading ? 'Bridging...' : 'Bridge Tokens'}
            </button>
          )}
        </div>

        {(isApproveSuccess || isBridgeSuccess) && txHash && (
          <div className="mt-3 text-center text-sm text-green-600">
            Transaction submitted successfully! Hash: {txHash}
          </div>
        )}

        {error && (
          <div className="mt-3 text-center text-sm text-red-600">
            Error: {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default TreatBridge;