import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useChainId, useBalance, useReadContract, useSwitchChain, usePublicClient, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther, pad } from 'viem';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ArrowLeftRight, ExternalLink } from 'lucide-react';
import ReactSlider from 'react-slider';
import { createClient } from '@layerzerolabs/scan-client';
import { ClipLoader } from 'react-spinners';
import oftAbi from './oftAbi.json';
import oftAdapterAbi from './oftAdapterAbi.json';

const chainConfigs = {
  11155111: { // Sepolia
    name: 'Sepolia',
    contractAddress: '0x845f1be42fdbf9f285bf1278256b6627543f51dd',
    tokenAddress: '0x845f1be42fdbf9f285bf1278256b6627543f51dd',
    nativeCurrency: "ETH",
    explorerUrl: 'https://sepolia.etherscan.io/tx/',
    icon: '🔵',
    lzChainId: 40161,
    abi: oftAbi,
  },
  97: { // BSC Testnet
    name: 'BSC Testnet',
    contractAddress: '0x845f1be42fdbf9f285bf1278256b6627543f51dd',
    tokenAddress: '0xdE637209AC5E70fA2F2B6C86684E860fd474A33E',
    nativeCurrency: "BNB",
    explorerUrl: 'https://testnet.bscscan.com/tx/',
    icon: '🟡',
    lzChainId: 40102,
    abi: oftAdapterAbi,
  },
  80002: { // Polygon Amoy
    name: 'Polygon Amoy',
    contractAddress: '0x845f1be42fdbf9f285bf1278256b6627543f51dd',
    tokenAddress: '0x845f1be42fdbf9f285bf1278256b6627543f51dd',
    nativeCurrency: "MATIC",
    explorerUrl: 'https://amoy.polygonscan.com/tx/',
    icon: '🟣',
    lzChainId: 40267,
    abi: oftAbi,
  }
};
const replacer = (key, value) => (typeof value === 'bigint' ? value.toString() : value);

const convertBigIntToString = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(convertBigIntToString);
  }

  return Object.entries(obj).reduce((acc, [key, value]) => {
    acc[key] = typeof value === 'bigint' ? value.toString() : convertBigIntToString(value);
    return acc;
  }, {});
};

// Loading Spinner Component
const LoadingSpinner = ({ loading, message }) => (
  <div className="flex flex-col items-center justify-center">
    <ClipLoader color="#db2777" loading={loading} size={50} />
    <p className="mt-2 text-pink-600 text-sm">{message}</p>
  </div>
);

const TreatBridge = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();

  const [lzClient] = useState(() => createClient('testnet'));
  const [lzMessage, setLzMessage] = useState(null);
  const [fromChain, setFromChain] = useState(chainConfigs[chainId] || chainConfigs[11155111]);
  const [toChain, setToChain] = useState(chainConfigs[97]);
  const [amount, setAmount] = useState('1');
  const [isApproved, setIsApproved] = useState(false);
  const [estimatedGas, setEstimatedGas] = useState(null);
  const [error, setError] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [percentageToTransfer, setPercentageToTransfer] = useState(0);
  const [transactionStatus, setTransactionStatus] = useState('');
  const [transactionState, setTransactionState] = useState('idle');
  const [eventLogs, setEventLogs] = useState([]);
  const [isLzLoading, setIsLzLoading] = useState(false);

  const { writeContract: writeApproveContract, isLoading: isApproveLoading, isSuccess: isApproveSuccess } = useWriteContract();
  const { writeContract: writeBridgeContract, data: writeBridgeData, isLoading: isBridgeLoading, isSuccess: isBridgeSuccess, error: bridgeError } = useWriteContract();
  const { data: transactionReceipt, isError: isTransactionError, isLoading: isTransactionLoading } = useWaitForTransactionReceipt({
    hash: txHash,
    enabled: !!txHash,
  });

  useEffect(() => {
    if (transactionReceipt) {
      const jsonReceipt = JSON.stringify(transactionReceipt, replacer);
      console.log("Transaction confirmed:", jsonReceipt);
      setTransactionStatus(`Transaction confirmed in block ${transactionReceipt.blockNumber}. Please wait for LayerZero confirmation...`);
      setTransactionState('transactionConfirmed');
      monitorLayerZeroTransaction(fromChain.lzChainId, txHash);
    }
  }, [transactionReceipt, txHash]);

  const { data: fromBalance, isLoading: isFromBalanceLoading, refetch: refetchFromBalance } = useBalance({
    address,
    token: fromChain.tokenAddress,
    chainId: Number(Object.keys(chainConfigs).find(key => chainConfigs[key] === fromChain)),
  });
  const { data: toBalance, isLoading: isToBalanceLoading, refetch: refetchToBalance } = useBalance({
    address,
    token: toChain.tokenAddress,
    chainId: Number(Object.keys(chainConfigs).find(key => chainConfigs[key] === toChain)),
  });
  const { data: allowance, isLoading: isAllowanceLoading, refetch: refetchAllowance } = useReadContract({
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
    args: address && fromChain.contractAddress ? [address, fromChain.contractAddress] : undefined,
    chainId: Number(Object.keys(chainConfigs).find(key => chainConfigs[key] === fromChain)),
    enabled: !!address && !!fromChain.contractAddress,
  });

  const estimateGas = async () => {
    if (!address || !fromChain.contractAddress || !toChain.lzChainId || !amount) return;

    try {
      const estimatedAmount = amount;
      const result = await publicClient.readContract({
        address: fromChain.contractAddress,
        abi: fromChain.abi,
        functionName: 'quoteSend',
        args: [{
          "dstEid": toChain.lzChainId,
          "to": pad(address),
          "amountLD": parseEther(estimatedAmount),
          "minAmountLD": parseEther(estimatedAmount),
          "extraOptions": '0x',
          "composeMsg": '0x',
          "oftCmd": '0x'
        },
          false
        ],
      });

      if (result) {
        const jsonResult = JSON.stringify(result, replacer);
        console.log('Estimated fees:', jsonResult);
        setEstimatedGas(result);
      } else {
        console.log('Estimated fees ERROR:', result);
        throw new Error('Invalid estimation result');
      }
    } catch (err) {
      console.error('Gas estimation error:', err);
      setEstimatedGas(BigInt(60000));
    }
  };

  useEffect(() => {
    if (fromChain && toChain && amount) {
      estimateGas();
    }
  }, [fromChain, toChain, amount]);

  useEffect(() => {
    if (chainId && chainConfigs[chainId]) {
      setFromChain(chainConfigs[chainId]);
      const otherChains = Object.values(chainConfigs).filter(chain => chain.name !== chainConfigs[chainId].name);
      setToChain(otherChains[Math.floor(Math.random() * otherChains.length)]);
      estimateGas();
    }
  }, [chainId]);

  useEffect(() => {
    if (allowance && fromBalance) {
      const isNowApproved = allowance >= (amount ? parseEther(amount) : fromBalance.value);
      setIsApproved(isNowApproved);
    }
  }, [allowance, fromBalance, amount]);

  useEffect(() => {
    if (txHash && publicClient) {
      const unwatch = publicClient.watchContractEvent({
        address: fromChain.contractAddress,
        abi: fromChain.abi,
        eventName: 'SendToChain',
        onLogs: (logs) => {
          console.log('New event logs:', logs);
          setEventLogs((prevLogs) => [...prevLogs, ...logs]);
          setTransactionStatus('Transaction event detected. Processing...');
        },
      });

      return () => {
        unwatch();
      };
    }
  }, [txHash, fromChain.contractAddress, fromChain.abi, publicClient]);

  const handleFromChainChange = (newChainId) => {
    const newFromChain = chainConfigs[newChainId];
    setFromChain(newFromChain);
    estimateGas();
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
      setTransactionState('preparing');
      setTransactionStatus('Preparing approval transaction...');

      const approvalAmount = parseEther(amount || formatEther(fromBalance.value));
      console.log('Approval amount:', approvalAmount);

      // Manually estimate gas
      const gasEstimate = await publicClient.estimateGas({
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
        args: [fromChain.contractAddress, approvalAmount],
        value: 0n
      });

      console.log('Gas estimate for approval:', gasEstimate);

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
        args: [fromChain.contractAddress, approvalAmount],
        gasLimit: gasEstimate || BigInt(60000)  // Use estimated gas or fallback
      });

      console.log('Approve result:', result);

      if (result && result.hash) {
        setTxHash(result.hash);
        setTransactionStatus('Approval transaction sent. Waiting for confirmation...');
        await refetchAllowance();
        setIsApproved(true); // Set approval state to true after approval transaction
      } else {
        throw new Error('No transaction hash received for approve');
      }
    } catch (err) {
      console.error("Error approving tokens:", err);
      setError(err.message || "An error occurred while approving tokens");
      setTransactionState('error');
    }
  };

  const handleBridge = async () => {
    if (!address || !amount || !isConnected || !isApproved || !estimatedGas) {
      console.error("Missing required parameters:", {
        address,
        amount,
        isConnected,
        isApproved,
        estimatedGas,
      });
      setError("Missing required parameters for bridge operation");
      return;
    }

    try {
      setError(null);
      setTransactionState('preparing');
      setTransactionStatus('Preparing bridge transaction...');

      // Convert amount to BigInt
      const amountBigInt = parseEther(amount);
      const nativeFeeBigInt = estimatedGas.nativeFee ? BigInt(estimatedGas.nativeFee) : 0n;
      const lzTokenFeeBigInt = estimatedGas.lzTokenFee ? BigInt(estimatedGas.lzTokenFee) : 0n;

      const bridgeParams = {
        address: fromChain.contractAddress,
        abi: fromChain.abi,
        functionName: 'send',
        args: [
          {
            dstEid: toChain.lzChainId,
            to: pad(address),
            amountLD: amountBigInt,
            minAmountLD: amountBigInt,
            extraOptions: '0x',
            composeMsg: '0x',
            oftCmd: '0x',
          },
          {
            nativeFee: nativeFeeBigInt,
            lzTokenFee: lzTokenFeeBigInt,
          },
          address,
        ],
        value: nativeFeeBigInt,
      };

      setTransactionState('awaitingConfirmation');
      setTransactionStatus('Please confirm the transaction in your wallet...');

      await writeBridgeContract(bridgeParams);
    } catch (err) {
      console.error("Error initiating bridge transaction:", err);
      setError(`Error initiating bridge transaction: ${err.message}`);
      setTransactionState('error');
    }
  };

  const monitorLayerZeroTransaction = async (srcChainId, txHash) => {
    console.log("Starting LayerZero transaction monitoring for hash:", txHash);
    setIsLzLoading(true); // Start spinner
    const maxAttempts = 30;
    let attempts = 0;

    const checkMessage = async () => {
      try {
        console.log(`Checking LayerZero message (attempt ${attempts + 1}/${maxAttempts})`);
        const response = await lzClient.getMessagesBySrcTxHash(txHash);
        const jsonResponse = JSON.stringify(response, replacer);
        console.log(jsonResponse);

        if (response && response.messages && response.messages.length > 0) {
          const message = response.messages[0];
          const jsonMessage = JSON.stringify(message, replacer);
          setLzMessage(message);

          console.log("LayerZero message status:", jsonMessage);
          if (message.status === 'DELIVERED') {
            setTransactionState('confirmed');
            setTransactionStatus(`LayerZero transaction confirmed. Message delivered to destination chain.`);
            setIsLzLoading(false); // Stop spinner
          } else {
            setTransactionStatus(`LayerZero status: ${message.status}. Waiting for final confirmation...`);
            if (attempts < maxAttempts) {
              attempts++;
              setTimeout(checkMessage, 5000);
            } else {
              console.log("Max attempts reached. Unable to confirm LayerZero transaction.");
              setIsLzLoading(false); // Stop spinner
            }
          }
        } else {
          console.log("No LayerZero messages found yet");
          if (attempts < maxAttempts) {
            attempts++;
            setTimeout(checkMessage, 5000);
          } else {
            console.log("Max attempts reached. Unable to confirm LayerZero transaction.");
            setIsLzLoading(false); // Stop spinner
          }
        }
      } catch (error) {
        console.error('Error monitoring LayerZero transaction:', error);
        setError(`Error monitoring LayerZero transaction: ${error.message}`);
        setTransactionState('error');
        setIsLzLoading(false); // Stop spinner
      }
    };

    checkMessage();
  };

  useEffect(() => {
    if (transactionReceipt) {
      setTransactionStatus(`Transaction confirmed in block ${transactionReceipt.blockNumber}. Please wait for LayerZero confirmation...`);
      refetchFromBalance();
      refetchToBalance();
    }
  }, [transactionReceipt]);

  useEffect(() => {
    if (transactionState === 'transactionConfirmed' && txHash) {
      monitorLayerZeroTransaction(fromChain.lzChainId, txHash);
    }
  }, [transactionState, txHash]);

  useEffect(() => {
    if (isBridgeSuccess && writeBridgeData) {
      console.log({ writeBridgeData });
      console.log("Bridge success, transaction hash:", writeBridgeData);
      setTxHash(writeBridgeData);
      setTransactionState('pending');
      setTransactionStatus('Bridge transaction sent. Waiting for confirmation...');
    } else if (bridgeError) {
      console.error("Bridge error:", bridgeError);
      setError(`Error bridging tokens: ${bridgeError.message}`);
      setTransactionState('error');
    }
  }, [isBridgeSuccess, writeBridgeData, bridgeError]);

  useEffect(() => {
    if (bridgeError) {
      console.error("Bridge error from useWriteContract:", bridgeError);
      setError(bridgeError.message || "An error occurred while preparing the bridge transaction");
      setTransactionState('error');
    }
  }, [bridgeError]);

  useEffect(() => {
    if (transactionReceipt) {
      setTransactionStatus(`Transaction confirmed in block ${transactionReceipt.blockNumber}. Please wait for LayerZero confirmation...`);
      setTransactionState('confirmed');
      refetchFromBalance();
      refetchToBalance();
    }
  }, [transactionReceipt]);

  const handleSwapChains = () => {
    setToChain(fromChain);
    handleFromChainChange(Object.keys(chainConfigs).find(key => chainConfigs[key] === toChain));
  };

  const handleSliderChange = (value) => {
    setPercentageToTransfer(value);
    if (fromBalance) {
      const newAmount = (BigInt(fromBalance.value) * BigInt(value) / BigInt(100)).toString();
      setAmount(Number(formatEther(newAmount)).toFixed(6));
    }
  };

  const calculateNewBalances = () => {
    if (!fromBalance || !toBalance || !amount) return { newFromBalance: null, newToBalance: null };
    const amountBigInt = parseEther(amount);
    const newFromBalance = fromBalance.value - amountBigInt;
    const newToBalance = toBalance.value + amountBigInt;

    return {
      newFromBalance: formatEther(newFromBalance > 0n ? newFromBalance : 0n),
      newToBalance: formatEther(newToBalance),
    };
  };

  const { newFromBalance, newToBalance } = calculateNewBalances();

  const isOnCorrectChain = chainId === Number(Object.keys(chainConfigs).find(key => chainConfigs[key] === fromChain));

  const getButtonText = () => {
    if (transactionState === 'confirmed' && isLzLoading) {
      return 'Confirmed, Waiting for LayerZero...';
    }

    return {
      idle: 'Bridge Tokens',
      preparing: 'Preparing...',
      awaitingConfirmation: 'Confirm in Wallet',
      pending: 'Waiting for Confirmation...',
      transactionConfirmed: 'Confirmed, Please wait for LayerZero...',
      confirmed: 'Bridge Transaction Complete',
      error: 'Try Again'
    }[transactionState];
  };

  const renderActionButton = () => {
    if (!isConnected) {
      return <div className="flex justify-center"><ConnectButton /></div>;
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

    if (!isApproved) {
      return (
        <button
          onClick={handleApprove}
          disabled={isApproveLoading || transactionState !== 'idle'}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isApproveLoading ? 'Approving...' : 'Approve TREAT'}
        </button>
      );
    }

    const buttonText = getButtonText();

    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-600">
          Estimated Gas Fee: {!estimatedGas || !estimatedGas.nativeFee ? 'Calculating...' : `${formatEther(estimatedGas.nativeFee)} ${fromChain.nativeCurrency}`}
        </p>
        <button
          onClick={handleBridge}
          disabled={isBridgeLoading || (transactionState !== 'idle' && transactionState !== 'error')}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 disabled:opacity-50"
        >
          {isBridgeLoading ? 'Confirming in Wallet...' : buttonText}
        </button>
      </div>
    );
  };


  const EventCard = ({ event, chainConfig }) => {
    const explorerUrl = `${chainConfig.explorerUrl}${event.transactionHash}`;

    return (
      <div className="bg-white rounded-lg shadow-md p-4 mb-4 hover:shadow-lg transition-shadow duration-300">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-800">{event.eventName}</h3>
            {
              event.blockNumber && (
                <p className="text-sm text-gray-600">
                  Block: <span className="font-medium text-gray-800">{event.blockNumber}</span>
                </p>
              )
            }
            <p className="text-sm text-gray-600">
              Log Index: <span className="font-medium text-gray-800">{event.logIndex}</span>
            </p>
          </div>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center text-blue-500 hover:text-blue-600 transition-colors duration-300"
          >
            <ExternalLink size={16} className="mr-1" />
            View in Explorer
          </a>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-200">
          {
            event.args?.from && (

              <p className="text-sm text-gray-600">
                From: <span className="font-medium text-gray-800">{event.args?.from}</span>
              </p>
            )
          }
          {
            event.args?.to && (

              <p className="text-sm text-gray-600">
                To: <span className="font-medium text-gray-800">{event.args?.to}</span>
              </p>
            )
          }
        </div>
      </div >
    );
  };
  const LzMessageCard = ({ message, fromChain, toChain }) => {
    const explorerUrlSrc = `${fromChain.explorerUrl}${message.srcTxHash}`;
    const explorerUrlDst = message.dstTxHash ? `${toChain.explorerUrl}${message.dstTxHash}` : '#';

    return (
      <div className="bg-white rounded-lg shadow-md p-4 mb-4 hover:shadow-lg transition-shadow duration-300">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-800">LayerZero Message</h3>
            <p className="text-sm text-gray-600">
              Status: <span className="font-medium text-green-600">{message.status}</span>
            </p>
          </div>
          <div className="flex space-x-2">
            <a
              href={explorerUrlSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center text-blue-500 hover:text-blue-600 transition-colors duration-300"
            >
              <ExternalLink size={16} className="mr-1" />
              Source Tx
            </a>
            {message.dstTxHash && (
              <a
                href={explorerUrlDst}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center text-blue-500 hover:text-blue-600 transition-colors duration-300"
              >
                <ExternalLink size={16} className="mr-1" />
                Destination Tx
              </a>
            )}
          </div>
        </div >
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="flex justify-between">
            <p className="text-sm text-gray-600">
              From: <span className="font-medium text-gray-800">{fromChain.name}</span>
            </p>
            <p className="text-sm text-gray-600">
              To: <span className="font-medium text-gray-800">{toChain.name}</span>
            </p>
          </div>
          {/* <div className="flex items-center justify-center mt-2">
            <Clock size={16} className="text-gray-400 mr-2" />
            <p className="text-sm text-gray-600">
              Created: <span className="font-medium text-gray-800">{new Date(message.createdAt).toLocaleString()}</span>
            </p>
          </div> */}
        </div>
      </div >
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-200 to-pink-100">
      <div className="flex justify-between items-center max-w-5xl mx-auto py-3 bg-transparent pt-10">
        {isConnected && <ConnectButton />}
      </div>
      <div className="mt-5 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 space-y-6 w-full max-w-5xl">
          <h1 className="text-3xl font-bold text-center text-pink-600">Treat Bridge</h1>

          <div className="flex flex-col lg:flex-row items-center space-y-4 lg:space-y-0 lg:space-x-4 py-10 px-5">
            <div className="flex-1 space-y-4 w-full">
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

            <button
              onClick={handleSwapChains}
              className="text-pink-600 hover:text-pink-700 transition-colors px-8"
              title="Click to swap chains"
            >
              <ArrowLeftRight size={24} />
            </button>

            <div className="flex-1 space-y-4 w-full">
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
            <h2 className="text-xl font-semibold text-gray-700 -mb-3">Amount to Transfer</h2>
            <div className="relative rounded-md shadow-sm">
              <input
                type="text"
                value={amount}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '' || /^\d*\.?\d*$/.test(value)) {
                    setAmount(value);
                    if (fromBalance) {
                      const percentage = (parseEther(value) * BigInt(100) / fromBalance.value).toString();
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

          {transactionStatus && (
            <div className="mt-3 text-center text-sm">
              <p className="text-blue-600">{transactionStatus}</p>
            </div>
          )}

          {error && (
            <div className="mt-3 text-center text-sm text-red-600">
              Error: {error}
            </div>
          )}

          {isLzLoading && <LoadingSpinner loading={isLzLoading} message="Waiting for LayerZero confirmation..." />}

          {lzMessage && <LzMessageCard message={lzMessage} fromChain={fromChain} toChain={toChain} />}
          {eventLogs.map((log, index) => (
            <EventCard key={index} event={log} chainConfig={fromChain} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default TreatBridge;
