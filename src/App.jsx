import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useChainId, useBalance, useReadContract, useSwitchChain, usePublicClient, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther, pad } from 'viem';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ArrowLeftRight } from 'lucide-react';
import ReactSlider from 'react-slider';

// Import your OFT and OFT Adapter ABIs
import oftAbi from './oftAbi.json';
import oftAdapterAbi from './oftAdapterAbi.json';

const chainConfigs = {
  11155111: { // Sepolia
    name: 'Sepolia',
    contractAddress: '0x845f1be42fdbf9f285bf1278256b6627543f51dd',
    tokenAddress: '0x845f1be42fdbf9f285bf1278256b6627543f51dd', // OFT is the token
    icon: '🔵',
    lzChainId: 40161,
    abi: oftAbi,
  },
  97: { // BSC Testnet
    name: 'BSC Testnet',
    contractAddress: '0x845f1be42fdbf9f285bf1278256b6627543f51dd', // OFT Adapter
    tokenAddress: '0xdE637209AC5E70fA2F2B6C86684E860fd474A33E', // TREAT token
    icon: '🟡',
    lzChainId: 40102,
    abi: oftAdapterAbi,
  },
  80002: { // Polygon Amoy
    name: 'Polygon Amoy',
    contractAddress: '0x845f1be42fdbf9f285bf1278256b6627543f51dd',
    tokenAddress: '0x845f1be42fdbf9f285bf1278256b6627543f51dd', // OFT is the token
    icon: '🟣',
    lzChainId: 40267,
    abi: oftAbi,
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
  const [estimatedGas, setEstimatedGas] = useState(null);
  const [error, setError] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [percentageToTransfer, setPercentageToTransfer] = useState(0);

  const { writeContract: writeApproveContract, isLoading: isApproveLoading, isSuccess: isApproveSuccess } = useWriteContract();
  const { writeContract: writeBridgeContract, isLoading: isBridgeLoading, isSuccess: isBridgeSuccess } = useWriteContract();
  const { data: transactionReceipt, isError: isTransactionError, isLoading: isTransactionLoading } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const { data: fromBalance, isLoading: isFromBalanceLoading } = useBalance({
    address,
    token: fromChain.tokenAddress,
    chainId: Number(Object.keys(chainConfigs).find(key => chainConfigs[key] === fromChain)),
  });

  const { data: toBalance, isLoading: isToBalanceLoading } = useBalance({
    address,
    token: toChain.tokenAddress,
    chainId: Number(Object.keys(chainConfigs).find(key => chainConfigs[key] === toChain)),
  });

  const { data: allowance, isLoading: isAllowanceLoading } = useReadContract({
    address: fromChain.tokenAddress,
    abi: [
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
    ],
    functionName: 'allowance',
    args: address ? [address, fromChain.contractAddress] : undefined,
    chainId: Number(Object.keys(chainConfigs).find(key => chainConfigs[key] === fromChain)),
    enabled: !!address && !!fromChain.contractAddress,
  });

  useEffect(() => {
    const estimateGas = async () => {
      if (!address || !amount || !fromChain.contractAddress || !toChain.lzChainId) return;

      try {
        console.log({ amount });
        const result = await publicClient.readContract({
          address: fromChain.contractAddress,
          abi: fromChain.abi,
          functionName: 'quoteSend',
          args: [{
            "dstEid": toChain.lzChainId,
            "to": pad(address),
            "amountLD": parseEther(amount || '0'),
            "minAmountLD": parseEther(amount || '0'),
            "extraOptions": '0x',
            "composeMsg": '0x',
            "oftCmd": '0x'
          },
            false
          ],
        });

        if (result) {
          console.log('Estimated fees:', result);
          setEstimatedGas(result);
        } else {
          console.log('Estimated fees ERROR:', result);
          throw new Error('Invalid estimation result');
        }
      } catch (err) {
        console.error('Gas estimation error:', err);
        setEstimatedGas(BigInt(60000)); // Fallback to 60k gas
      }
    };

    estimateGas();
  }, [address, amount, fromChain, toChain, publicClient]);

  useEffect(() => {
    if (chainId && chainConfigs[chainId]) {
      setFromChain(chainConfigs[chainId]);
      const otherChains = Object.values(chainConfigs).filter(chain => chain.name !== chainConfigs[chainId].name);
      setToChain(otherChains[Math.floor(Math.random() * otherChains.length)]);
    }
  }, [chainId]);

  useEffect(() => {
    if (allowance && fromBalance) {
      const isNowApproved = allowance >= fromBalance.value;
      setIsApproved(isNowApproved);
    }
  }, [allowance, fromBalance]);

  const handleFromChainChange = (newChainId) => {
    const newFromChain = chainConfigs[newChainId];
    setFromChain(newFromChain);
    const otherChains = Object.values(chainConfigs).filter(chain => chain.name !== newFromChain.name);
    setToChain(otherChains[Math.floor(Math.random() * otherChains.length)]);
  };

  const handleSwitchChain = async () => {
    if (switchChain) {
      try {
        const targetChainId = Number(Object.keys(chainConfigs).find(key => chainConfigs[key] === fromChain));
        await switchChain({ chainId: targetChainId });
      } catch (error) {
        console.error('Error switching chain:', error);
        setError('Failed to switch chain. Please try again.');
      }
    }
  };

  const handleApprove = async () => {
    if (!address || !fromBalance || !isConnected) return;

    try {
      setError(null);
      const result = await writeApproveContract({
        address: fromChain.tokenAddress,
        abi: [
          {
            constant: false,
            inputs: [
              { name: '_spender', type: 'address' },
              { name: '_value', type: 'uint256' }
            ],
            name: 'approve',
            outputs: [{ name: '', type: 'bool' }],
            type: 'function'
          }
        ],
        functionName: 'approve',
        args: [fromChain.contractAddress, fromBalance.value],
      });

      if (result && result.hash) {
        setTxHash(result.hash);
      } else {
        throw new Error('No transaction hash received for approve');
      }
    } catch (err) {
      console.error("Error approving tokens:", err);
      setError(err.message || "An error occurred while approving tokens");
    }
  };

  const handleBridge = async () => {
    if (!address || !amount || !isConnected || !isApproved) return;

    try {
      setError(null);
      console.log('Bridging with parameters:', {
        address: fromChain.contractAddress,
        abi: fromChain.abi,
        functionName: 'send',
        args: [{
          "dstEid": toChain.lzChainId,
          "to": pad(address),
          "amountLD": parseEther(amount || '0'),
          "minAmountLD": parseEther(amount || '0'),
          "extraOptions": '0x',
          "composeMsg": '0x',
          "oftCmd": '0x'
        }],
        value: estimatedGas,
      });

      const result = await writeBridgeContract({
        address: fromChain.contractAddress,
        abi: fromChain.abi,
        functionName: 'send',
        args: [{
          "dstEid": toChain.lzChainId,
          "fee": estimatedGas,
          "to": pad(address),
          "amountLD": parseEther(amount || '0'),
          "minAmountLD": parseEther(amount || '0'),
          "extraOptions": '0x',
          "composeMsg": '0x',
          "oftCmd": '0x'
        },
        {}
        ],
        value: estimatedGas,
      });

      if (result && result.hash) {
        setTxHash(result.hash);
      } else {
        throw new Error('No transaction hash received for bridge');
      }
    } catch (err) {
      console.error("Error bridging tokens:", err);
      setError(err.message || "An error occurred while bridging tokens");
    }
  };

  const handleSwapChains = () => {
    setToChain(fromChain);
    handleFromChainChange(Object.keys(chainConfigs).find(key => chainConfigs[key] === toChain));
  };

  const handleSliderChange = (value) => {
    setPercentageToTransfer(value);
    if (fromBalance) {
      const newAmount = (BigInt(fromBalance.value) * BigInt(value) / BigInt(100)).toString();
      setAmount(formatEther(newAmount));
    }
  };

  const calculateNewBalances = () => {
    if (!fromBalance || !toBalance || !amount) return { newFromBalance: null, newToBalance: null };

    const amountBigInt = parseEther(amount);
    const newFromBalance = fromBalance.value - amountBigInt;
    const newToBalance = toBalance.value + amountBigInt;

    return {
      newFromBalance: formatEther(newFromBalance),
      newToBalance: formatEther(newToBalance),
    };
  };

  const { newFromBalance, newToBalance } = calculateNewBalances();

  const isOnCorrectChain = chainId === Number(Object.keys(chainConfigs).find(key => chainConfigs[key] === fromChain));

  const renderActionButton = () => {
    if (!isConnected) {
      return <div className="flex justify-center" ><ConnectButton /></div>;
    }

    if (!isOnCorrectChain) {
      return (
        <button
          onClick={handleSwitchChain}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
        >
          Switch to {fromChain.name}
        </button>
      );
    }

    if (!isApproved && fromBalance && allowance && fromBalance.value > allowance) {
      return (
        <button
          onClick={handleApprove}
          disabled={isApproveLoading || isTransactionLoading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isApproveLoading || isTransactionLoading ? 'Approving...' : 'Approve TREAT'}
        </button>
      );
    }

    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-600">
          Estimated Gas Fee: {estimatedGas?.nativeFee === BigInt(0) ? 'Calculating...' : `${estimatedGas?.nativeFee} ETH`}
        </p>
        <button
          onClick={handleBridge}
          disabled={isBridgeLoading || isTransactionLoading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 disabled:opacity-50"
        >
          {isBridgeLoading || isTransactionLoading ? 'Bridging...' : 'Bridge Tokens'}
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-200 to-pink-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 space-y-6 w-full max-w-5xl">
        <h1 className="text-3xl font-bold text-center text-pink-600">Treat Bridge</h1>

        <div className="flex items-center space-x-4 py-10 px-5">
          {/* From Chain */}
          <div className="flex-1 space-y-4">
            <h2 className="text-xl font-semibold text-gray-700">From</h2>
            <select
              value={fromChain.name}
              onChange={(e) => handleFromChainChange(Object.keys(chainConfigs).find(key => chainConfigs[key].name === e.target.value))}
              className="w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm rounded-md"
            >
              {Object.values(chainConfigs).map((chain) => (
                <option key={chain.name} value={chain.name}>{chain.icon} {chain.name}</option>
              ))}
            </select>
            <div className="bg-gray-50 p-4 rounded-md">
              <h3 className="text-sm font-medium text-gray-700">Current Balance</h3>
              <p className="mt-1 text-xl font-semibold text-gray-900">
                {isFromBalanceLoading ? 'Loading...' :
                  fromBalance ? `${parseFloat(formatEther(fromBalance.value)).toFixed(4)} TREAT` : 'N/A'}
              </p>
              {newFromBalance && (
                <div className="mt-2">
                  <h3 className="text-sm font-medium text-gray-700">New Balance After Transfer</h3>
                  <p className="text-lg font-semibold text-blue-600">{parseFloat(newFromBalance).toFixed(4)} TREAT</p>
                </div>
              )}
            </div>
          </div>

          {/* Swap Button */}
          <button
            onClick={handleSwapChains}
            className="text-pink-600 hover:text-pink-700 transition-colors px-8"
            title="Click to swap chains"
          >
            <ArrowLeftRight size={24} />
          </button>

          {/* To Chain */}
          <div className="flex-1 space-y-4">
            <h2 className="text-xl font-semibold text-gray-700">To</h2>
            <select
              value={toChain.name}
              onChange={(e) => {
                const selected = Object.values(chainConfigs).find(c => c.name === e.target.value);
                if (selected) setToChain(selected);
              }}
              className="w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm rounded-md"
            >
              {Object.values(chainConfigs).map((chain) => (
                <option key={chain.name} value={chain.name}>{chain.icon} {chain.name}</option>
              ))}
            </select>
            <div className="bg-gray-50 p-4 rounded-md">
              <h3 className="text-sm font-medium text-gray-700">Current Balance</h3>
              <p className="mt-1 text-xl font-semibold text-gray-900">
                {isToBalanceLoading ? 'Loading...' :
                  toBalance ? `${parseFloat(formatEther(toBalance.value)).toFixed(4)} TREAT` : 'N/A'}
              </p>
              {newToBalance && (
                <div className="mt-2">
                  <h3 className="text-sm font-medium text-gray-700">New Balance After Transfer</h3>
                  <p className="text-lg font-semibold text-blue-600">{parseFloat(newToBalance).toFixed(4)} TREAT</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4 max-w-sm mx-auto text-center">
          <h2 className="text-xl font-semibold text-gray-700">Amount to Transfer</h2>
          <div className="relative rounded-md shadow-sm">
            <input
              type="text"
              value={amount}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '' || /^\d*\.?\d*$/.test(value)) {
                  setAmount(value);
                  if (fromBalance) {
                    const percentage = (formatEther(value) * BigInt(100) / fromBalance.value).toString();
                    setPercentageToTransfer(Math.min(Number(percentage), 100));
                  }
                }
              }}
              placeholder="0.0"
              className="focus:ring-pink-500 focus:border-pink-500 block w-full pl-3 pr-20 sm:text-sm border-gray-300 rounded-md h-12"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <span className="text-gray-500 sm:text-sm">TREAT</span>
            </div>
          </div>
          <div className="space-y-2">
            <ReactSlider
              className="w-full h-1 bg-gray-200 rounded-lg"
              thumbClassName="w-4 h-4 bg-pink-500 rounded-full focus:outline-none focus:ring-2 focus:ring-pink-400 -mt-1.5"
              trackClassName="h-1 bg-pink-300 rounded-lg"
              value={percentageToTransfer}
              onChange={handleSliderChange}
              min={0}
              max={100}
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>0%</span>
              <span className="font-bold text-sm">{percentageToTransfer}%</span>
              <span>100%</span>
            </div>
          </div>
        </div>


        <div className="pt-4 max-w-sm mx-auto text-center">
          {renderActionButton()}
        </div>

        {txHash && (
          <div className="mt-3 text-center text-sm">
            {isTransactionLoading ? (
              <p className="text-blue-600">Transaction pending... Hash: {txHash}</p>
            ) : isTransactionError ? (
              <p className="text-red-600">Transaction failed. Please try again.</p>
            ) : (
              <p className="text-green-600">Transaction successful! Hash: {txHash}</p>
            )}
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
}

export default TreatBridge