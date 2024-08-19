import React, { useState, useEffect, useRef } from 'react';
import {
  useAccount, useWriteContract, useChainId, useBalance,
  useReadContract, useSwitchChain, usePublicClient, useWaitForTransactionReceipt
} from 'wagmi';
import { parseEther, formatEther, pad, isAddress } from 'viem';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ArrowLeftRight, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import ReactSlider from 'react-slider';
import { createClient } from '@layerzerolabs/scan-client';
import { ClipLoader } from 'react-spinners';
import oftAbi from './oftAbi.json';
import oftAdapterAbi from './oftAdapterAbi.json';
import treatLogo from "./icons/treat.png";
import bnbIcon from 'cryptocurrency-icons/svg/color/bnb.svg';
import ethIcon from 'cryptocurrency-icons/svg/color/eth.svg';
import maticIcon from 'cryptocurrency-icons/svg/color/matic.svg';

const chainConfigs = {
  11155111: {
    chainId: 11155111,
    name: 'Sepolia',
    contractAddress: '0x845f1be42fdbf9f285bf1278256b6627543f51dd',
    tokenAddress: '0x845f1be42fdbf9f285bf1278256b6627543f51dd',
    nativeCurrency: "ETH",
    explorerUrl: 'https://sepolia.etherscan.io/tx/',
    icon: ethIcon,
    lzChainId: 40161,
    abi: oftAbi,
  },
  97: {
    chainId: 97,
    name: 'BSC Testnet',
    contractAddress: '0x845f1be42fdbf9f285bf1278256b6627543f51dd',
    tokenAddress: '0xdE637209AC5E70fA2F2B6C86684E860fd474A33E',
    nativeCurrency: "BNB",
    explorerUrl: 'https://testnet.bscscan.com/tx/',
    icon: bnbIcon,
    lzChainId: 40102,
    abi: oftAdapterAbi,
  },
  80002: {
    chainId: 80002,
    name: 'Polygon Amoy',
    contractAddress: '0x845f1be42fdbf9f285bf1278256b6627543f51dd',
    tokenAddress: '0x845f1be42fdbf9f285bf1278256b6627543f51dd',
    nativeCurrency: "MATIC",
    explorerUrl: 'https://amoy.polygonscan.com/tx/',
    icon: maticIcon,
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

const LoadingSpinner = ({ loading, message }) => (
  <div className="flex flex-col items-center justify-center">
    <ClipLoader color="#db2777" loading={loading} size={50} />
    <p className="mt-2 text-pink-600 text-sm">{message}</p>
  </div>
);

const CustomDropdown = ({ options, value, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (option) => {
    onChange(option);
    setIsOpen(false);
  };

  const selectedOption = options.find(option => option.name === value);

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        className={`flex items-center space-x-2 w-full pl-3 pr-10 py-2 text-base border-2 border-gray-300 rounded-md bg-white shadow-sm cursor-pointer ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <img src={selectedOption?.icon} alt={selectedOption?.name} className="w-6 h-6" />
        <span>{selectedOption?.name}</span>
        <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2" />
      </div>
      {isOpen && (
        <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
          {options.map((option) => (
            <li
              key={option.name}
              className="flex items-center space-x-2 px-3 py-2 hover:bg-gray-100 cursor-pointer"
              onClick={() => handleSelect(option)}
            >
              <img src={option.icon} alt={option.name} className="w-6 h-6" />
              <span>{option.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const TreatBridge = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();

  const [lzClient] = useState(() => createClient('testnet'));
  const [lzMessage, setLzMessage] = useState(null);
  const [fromChain, setFromChain] = useState(() => {
    return chainConfigs[97]; // BSC Testnet
  });
  const [toChain, setToChain] = useState(() => {
    return chainConfigs[11155111]; // Sepolia
  });
  const [isApprovalPending, setIsApprovalPending] = useState(false);
  const [currentTransactionType, setCurrentTransactionType] = useState(null); // 'approval' or 'bridge'
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
  const [toAddress, setToAddress] = useState('');
  const [useCustomAddress, setUseCustomAddress] = useState(false);
  const [isValidAddress, setIsValidAddress] = useState(true);
  const [gasFeeError, setGasFeeError] = useState(null);
  const [approvalGasEstimate, setApprovalGasEstimate] = useState(null);
  const [approvalGasError, setApprovalGasError] = useState(null);
  const [showTransactionStatus, setShowTransactionStatus] = useState(false);
  const [isApprovalInProgress, setIsApprovalInProgress] = useState(false);
  const [approvalState, setApprovalState] = useState('idle'); // 'idle', 'awaitingConfirmation', 'confirming', 'success', 'error'

  const {
    writeContract: writeApproveContract,
    data: approveData,
    isLoading: isApproveLoading,
    isSuccess: isApproveSuccess,
    error: approveError
  } = useWriteContract();
  const { writeContract: writeBridgeContract, data: writeBridgeData, isLoading: isBridgeLoading, isSuccess: isBridgeSuccess, error: bridgeError } = useWriteContract();

  const { data: fromBalance, isLoading: isFromBalanceLoading, refetch: refetchFromBalance } = useBalance({
    address,
    token: fromChain?.tokenAddress,
    chainId: fromChain?.chainId,
  });

  const { data: toBalance, isLoading: isToBalanceLoading, refetch: refetchToBalance } = useBalance({
    address,
    token: toChain?.tokenAddress,
    chainId: toChain?.chainId,
  });

  const { data: allowance, isLoading: isAllowanceLoading, refetch: refetchAllowance } = useReadContract({
    address: fromChain?.tokenAddress,
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
    args: address && fromChain?.contractAddress ? [address, fromChain.contractAddress] : undefined,
    chainId: fromChain?.chainId,
    enabled: !!address && !!fromChain?.contractAddress,
  });

  const isTransactionInProgress =
    transactionState !== 'idle' &&
    transactionState !== 'confirmed' &&
    transactionState !== 'error';

  useEffect(() => {
    if (fromChain && toChain && amount && address) {
      estimateGas();
    }
  }, [fromChain, toChain, amount, address]);

  useEffect(() => {
    if (address && fromChain) {
      refetchAllowance();
      refetchFromBalance();
    }
  }, [address, fromChain, refetchAllowance, refetchFromBalance]);

  useEffect(() => {
    if (allowance && fromBalance && amount) {
      const amountToApprove = parseEther(amount);
      const isNowApproved = allowance >= amountToApprove;
      setIsApproved(isNowApproved);
      setTransactionState("idle");
    }
  }, [allowance, fromBalance, amount]);

  useEffect(() => {
    if (chainId && chainConfigs[chainId]) {
      setFromChain(chainConfigs[chainId]);
      // Set the toChain to Sepolia if the current chain is not Sepolia, otherwise set it to BSC Testnet
      setToChain(chainId !== 11155111 ? chainConfigs[11155111] : chainConfigs[97]);
    } else {
      // If the connected chain is not in our configs, default to BSC Testnet -> Sepolia
      setFromChain(chainConfigs[97]);
      setToChain(chainConfigs[11155111]);
    }
  }, [chainId]);

  useEffect(() => {
    if (address) {
      setToAddress(address);
    }
  }, [address]);

  useEffect(() => {
    if (isApproveSuccess && approveData) {
      handleApprovalSuccess(approveData);
    } else if (approveError) {
      setApprovalState('error');
      setTransactionStatus('');
      setError('Approval failed. Please try again.');
      setIsApprovalInProgress(false);
    }
  }, [isApproveSuccess, approveError, approveData]);

  useEffect(() => {
    if (txHash && publicClient) {
      watchContractEvent();
    }
  }, [txHash, fromChain?.contractAddress, fromChain?.abi, publicClient]);

  useEffect(() => {
    if (isBridgeSuccess && writeBridgeData) {
      handleBridgeSuccess(writeBridgeData);
    } else if (bridgeError) {
      handleBridgeError(bridgeError);
    }
  }, [isBridgeSuccess, writeBridgeData, bridgeError]);

  const handleApprovalSuccess = async (txHash) => {
    setTransactionStatus('Approval transaction confirmed. Updating allowance...');

    // Wait for the transaction to be mined
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    // Refetch the allowance to ensure it's updated
    await refetchAllowance();

    setApprovalState('success');
    setIsApproved(true);
    setIsApprovalInProgress(false);
    setTransactionStatus('Approval successful. You can now bridge your tokens.');
  };

  const estimateGas = async () => {
    if (!address || !fromChain?.contractAddress || !toChain?.lzChainId || !amount) {
      setEstimatedGas(null);
      return;
    }

    try {
      setEstimatedGas(null); // Reset to null while calculating
      const estimatedAmount = amount === '' ? '0' : amount;
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

      if (result && result.nativeFee && BigInt(result.nativeFee) > 0n) {
        const jsonResult = JSON.stringify(result, replacer);
        console.log('Estimated fees:', jsonResult);
        setEstimatedGas(result);
      } else {
        console.log('Invalid estimation result:', result);
        throw new Error('Invalid estimation result');
      }
    } catch (err) {
      console.error('Gas estimation error:', err);
      setEstimatedGas({ nativeFee: BigInt(60000) }); // Set a default value
    }
  };

  const resetTransactionStatus = () => {
    setShowTransactionStatus(false);
    setTxHash(null);
    setLzMessage(null);
    setEventLogs([]);
  };

  useEffect(() => {
    if (useCustomAddress) {
      resetTransactionStatus();
    }
  }, [useCustomAddress]);

  const handleFromChainChange = async (selectedChain) => {
    if (!selectedChain || selectedChain.chainId === fromChain?.chainId) return;

    resetAllStates();
    setFromChain(selectedChain);
    if (selectedChain.chainId === toChain?.chainId) {
      setToChain(fromChain);
    }

    // Wait for state updates to propagate
    await new Promise(resolve => setTimeout(resolve, 100));

    // Refetch data and estimate gas
    await refetchData();
  };

  const handleToChainChange = (selectedChain) => {
    if (!selectedChain || selectedChain.chainId === toChain?.chainId) return;
    resetAllStates();
    setToChain(selectedChain);
    if (selectedChain.chainId === fromChain?.chainId) {
      setFromChain(toChain);
    }
    refetchData();
  };

  const handleSwapChains = () => {
    resetAllStates();
    const tempFrom = fromChain;
    setFromChain(toChain);
    setToChain(tempFrom);
    refetchData();
  };

  const resetAllStates = () => {
    setIsApproved(false);
    setTransactionState('idle');
    setCurrentTransactionType(null);
    setTransactionStatus('');
    setError(null);
    setGasFeeError(null);
    setApprovalGasError(null);
    setEstimatedGas(null);
    setAmount('');
    setPercentageToTransfer(0);
    setIsApprovalPending(false);
    resetTransactionStatus();
  };

  const refetchData = async () => {
    try {
      await Promise.all([
        refetchAllowance(),
        refetchFromBalance(),
        refetchToBalance(),
        estimateGas(),
      ]);
    } catch (error) {
      console.error("Error refetching data:", error);
      setError("Failed to fetch updated data. Please try again.");
    }
  };

  const isOnCorrectChain = chainId === fromChain?.chainId;

  const handleSwitchChain = async () => {
    if (switchChain && fromChain) {
      try {
        await switchChain({ chainId: fromChain.chainId });
      } catch (error) {
        console.error('Error switching chain:', error);
        setError('Failed to switch chain. Please try again.');
      }
    }
  };

  const handleToAddressChange = (e) => {
    const newAddress = e.target.value;
    setToAddress(newAddress);
    setIsValidAddress(isAddress(newAddress));
  };

  const estimateApprovalGas = async () => {
    if (!address || !fromChain?.tokenAddress || !fromChain?.contractAddress) return;

    try {
      setApprovalGasError(null);
      const approvalAmount = parseEther(amount || formatEther(fromBalance.value));
      const gasEstimate = await publicClient.estimateContractGas({
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
        account: address,
      });

      // Add a 50% buffer to the gas estimate
      const estimateWithBuffer = gasEstimate * BigInt(150) / BigInt(100);
      setApprovalGasEstimate(estimateWithBuffer);
      return estimateWithBuffer;
    } catch (err) {
      console.error("Error estimating approval gas:", err);
      setApprovalGasError("Unable to estimate approval gas. You may not have enough funds...");
      return null;
    }
  };

  const estimateBridgeGas = async (retryCount = 0) => {
    if (!address || !fromChain?.contractAddress || !toChain?.lzChainId || !amount) return;

    try {
      const amountBigInt = parseEther(amount);
      const nativeFeeBigInt = estimatedGas.nativeFee ? BigInt(estimatedGas.nativeFee) : 0n;
      const lzTokenFeeBigInt = estimatedGas.lzTokenFee ? BigInt(estimatedGas.lzTokenFee) : 0n;

      const gasEstimate = await publicClient.estimateContractGas({
        address: fromChain.contractAddress,
        abi: fromChain.abi,
        functionName: 'send',
        args: [
          {
            dstEid: toChain.lzChainId,
            to: pad(address, { size: 32 }),
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
          address, // refundAddress
        ],
        value: nativeFeeBigInt,
        account: address,
      });

      return gasEstimate * BigInt(150) / BigInt(100); // Add 50% buffer
    } catch (err) {
      console.error("Error estimating bridge gas:", err);
      if (retryCount < 2) {
        // Retry with a small delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        return estimateBridgeGas(retryCount + 1);
      }
      // If all retries fail, return a fallback gas limit
      return BigInt(1000000); // Increased fallback gas limit for bridge
    }
  };

  const checkSufficientGas = async (gasLimit, maxFeePerGas) => {
    const balance = await publicClient.getBalance({ address });
    const estimatedGasCost = gasLimit * maxFeePerGas;
    const totalCost = estimatedGasCost + BigInt(estimatedGas.nativeFee || 0);

    if (balance < totalCost) {
      const shortfall = formatEther(totalCost - balance);
      throw new Error(`Insufficient gas. You need approximately ${shortfall} more ${fromChain.nativeCurrency} to complete this transaction.`);
    }
  };

  const checkSufficientGasForApproval = async () => {
    if (!approvalGasEstimate) return false;

    const balance = await publicClient.getBalance({ address });
    const feeData = await publicClient.getFeeHistory({ blockCount: 2, rewardPercentiles: [25, 75] });
    const maxFeePerGas = feeData.baseFeePerGas[0] * BigInt(2) + feeData.reward[0][1];
    const estimatedGasCost = approvalGasEstimate * maxFeePerGas;

    if (balance < estimatedGasCost) {
      const shortfall = formatEther(estimatedGasCost - balance);
      setApprovalGasError(`Insufficient gas for approval. You need approximately ${shortfall} more ${fromChain.nativeCurrency}.`);
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (isConnected && !isApproved) {
      estimateApprovalGas();
    }
  }, [isConnected, isApproved, fromChain, amount]);

  const handleApprove = async () => {
    if (!address || !fromBalance || !isConnected) return;

    try {
      setError(null);
      setApprovalGasError(null);
      setApprovalState('awaitingConfirmation');
      setTransactionStatus('Please confirm the approval transaction in your wallet...');
      setIsApprovalInProgress(true); // Set approval in progress

      const approvalAmount = parseEther(amount || formatEther(fromBalance.value));
      console.log('Approval amount:', approvalAmount);

      await writeApproveContract({
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
      });

      setApprovalState('confirming');
      setTransactionStatus('Approval transaction sent. Waiting for confirmation...');

    } catch (err) {
      console.error("Error approving tokens:", err);
      setApprovalState('error');
      setTransactionStatus('');
      setError(err.message || "An error occurred while approving tokens");
      setIsApprovalInProgress(false); // Reset approval in progress
    }
  };

  const handleError = (error, errorMessage) => {
    console.error(errorMessage, error);
    setTransactionState('idle');
    setCurrentTransactionType(null);
    setTransactionStatus('');
    setError(error.message || errorMessage);
  };

  const handleBridge = async () => {
    if (!address || !amount || !isConnected || !isApproved || !estimatedGas || (useCustomAddress && !isValidAddress)) {
      setError("Missing required parameters for bridge operation or invalid destination address");
      return;
    }

    try {
      // Reset states for new transaction
      setError(null);
      setGasFeeError(null);
      setTransactionState('preparing');
      setTransactionStatus('Preparing bridge transaction...');
      setCurrentTransactionType('bridge');
      setLzMessage(null);
      setTxHash(null);
      setEventLogs([]);
      setShowTransactionStatus(true); // Show transaction status when bridging starts

      // Re-estimate gas before each transaction
      await estimateGas();

      const amountBigInt = parseEther(amount);
      const nativeFeeBigInt = estimatedGas.nativeFee ? BigInt(estimatedGas.nativeFee) : 0n;
      const lzTokenFeeBigInt = estimatedGas.lzTokenFee ? BigInt(estimatedGas.lzTokenFee) : 0n;

      const destinationAddress = useCustomAddress ? toAddress : address;

      let gasLimit;
      try {
        gasLimit = await estimateBridgeGas();
      } catch (err) {
        console.error("Error estimating gas, using fallback:", err);
        gasLimit = BigInt(1000000); // Use increased fallback gas limit
      }

      const feeData = await publicClient.getFeeHistory({ blockCount: 2, rewardPercentiles: [25, 75] });
      const maxFeePerGas = feeData.baseFeePerGas[0] * BigInt(2) + feeData.reward[0][1];

      // Check if user has sufficient gas
      try {
        await checkSufficientGas(gasLimit, maxFeePerGas);
      } catch (err) {
        setGasFeeError(err.message);
        setTransactionState('idle'); // Reset transaction state
        setTransactionStatus(''); // Clear transaction status
        return;
      }

      const bridgeParams = {
        address: fromChain.contractAddress,
        abi: fromChain.abi,
        functionName: 'send',
        args: [
          {
            dstEid: toChain.lzChainId,
            to: pad(destinationAddress, { size: 32 }),
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
          address, // refundAddress
        ],
        value: nativeFeeBigInt,
        gas: gasLimit,
        maxFeePerGas,
      };

      setTransactionState('awaitingConfirmation');
      setTransactionStatus('Please confirm the transaction in your wallet...');

      await writeBridgeContract(bridgeParams);
    } catch (err) {
      handleError(err, "Error initiating bridge transaction:");
    }
  };

  const monitorLayerZeroTransaction = async (srcChainId, txHash) => {
    console.log("Starting LayerZero transaction monitoring for hash:", txHash);
    setIsLzLoading(true);
    setTxHash(txHash);
    const maxAttempts = 60;
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

          console.log("LayerZero message status:", jsonMessage);
          setLzMessage(message);

          if (message.status === 'DELIVERED') {
            setTransactionState('confirmed');
            setTransactionStatus(`LayerZero transaction confirmed. Message delivered to destination chain.`);
            setIsLzLoading(false);
            refetchFromBalance();
            refetchToBalance();
          } else {
            setTransactionStatus(`LayerZero status: ${message.status}. Waiting for final confirmation...`);
            if (attempts < maxAttempts) {
              attempts++;
              setTimeout(checkMessage, 5000);
            } else {
              console.log("Max attempts reached. Unable to confirm LayerZero transaction.");
              setIsLzLoading(false);
              setTransactionStatus("Unable to confirm LayerZero transaction. Please check the explorer for the latest status.");
            }
          }
        } else {
          console.log("No LayerZero messages found yet");
          if (attempts < maxAttempts) {
            attempts++;
            setTimeout(checkMessage, 5000);
          } else {
            console.log("Max attempts reached. Unable to confirm LayerZero transaction.");
            setIsLzLoading(false);
            setTransactionStatus("Unable to find LayerZero message. Please check the explorer for the latest status.");
          }
        }
      } catch (error) {
        console.error('Error monitoring LayerZero transaction:', error);
        setError(`Error monitoring LayerZero transaction: ${error.message}`);
        setTransactionState('error');
        setIsLzLoading(false);
      }
    };

    checkMessage();
  };

  const handleBridgeSuccess = (writeBridgeData) => {
    console.log("Bridge success, transaction hash:", writeBridgeData);
    setTxHash(writeBridgeData);
    setTransactionState('pending');
    setTransactionStatus('Bridge transaction sent. Waiting for confirmation...');
    monitorLayerZeroTransaction(fromChain.lzChainId, writeBridgeData);

    // Reset states for next transaction
    setAmount('');
    setPercentageToTransfer(0);
    setEstimatedGas(null);
    setError(null);
  };

  const handleBridgeError = (bridgeError) => {
    console.error("Bridge error:", bridgeError);

    // Check if the error is due to user rejection
    if (bridgeError.code === 4001 || bridgeError.message.includes("User denied transaction signature")) {
      // User rejected the transaction, just reset the UI state
      setTransactionState('idle');
      setCurrentTransactionType(null);
      setTransactionStatus('');
      setError(null); // Clear any existing error message
    } else {
      // For other errors, show a generic message
      setError("An error occurred. Please try again.");
      setTransactionState('idle');
      setCurrentTransactionType(null);
      setTransactionStatus('');
    }
  };

  const watchContractEvent = () => {
    const unwatch = publicClient.watchContractEvent({
      address: fromChain?.contractAddress,
      abi: fromChain?.abi,
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

  const renderActionButton = () => {
    if (!isConnected) return <div className="flex justify-center"><ConnectButton /></div>;
    if (!isOnCorrectChain) return (
      <button onClick={handleSwitchChain} className="w-full py-3 px-4 bg-yellow-500 text-white font-medium rounded-lg shadow hover:bg-yellow-600 transition duration-150 ease-in-out">
        Switch to {fromChain?.name}
      </button>
    );
    if (!isApproved) {
      switch (approvalState) {
        case 'awaitingConfirmation':
          return <button disabled className="w-full py-3 px-4 bg-blue-500 text-white font-medium rounded-lg shadow opacity-50">Confirm in Wallet</button>;
        case 'confirming':
          return <button disabled className="w-full py-3 px-4 bg-blue-500 text-white font-medium rounded-lg shadow opacity-50">Approval Confirming...</button>;
        case 'error':
        case 'idle':
        default:
          return <button onClick={handleApprove} className="w-full py-3 px-4 bg-blue-500 text-white font-medium rounded-lg shadow hover:bg-blue-600 transition duration-150 ease-in-out">Approve TREAT</button>;
      }
    }
    return (
      <button onClick={handleBridge} disabled={isBridgeLoading || (transactionState !== 'idle' && transactionState !== 'confirmed' && transactionState !== 'error')}
        className="w-full py-3 px-4 bg-pink-500 text-white font-medium rounded-lg shadow hover:bg-pink-600 transition duration-150 ease-in-out disabled:opacity-50">
        {isBridgeLoading ? 'Confirming in Wallet...' :
          transactionState === 'pending' ? 'Bridge In Progress...' :
            transactionState === 'confirmed' ? 'Bridge Again' :
              transactionState === 'error' ? 'Try Again' : 'Bridge Tokens'}
      </button>
    );
  };

  const TransactionStatusCard = ({ message, fromChain, toChain, txHash, toAddress, useCustomAddress }) => {
    const explorerUrlSrc = `${fromChain?.explorerUrl}${txHash || message?.srcTxHash}`;
    const explorerUrlDst = message?.dstTxHash ? `${toChain?.explorerUrl}${message.dstTxHash}` : '#';
    const layerZeroExplorerUrl = txHash ? `https://testnet.layerzeroscan.com/tx/${txHash}` : '#';

    const getStatusColor = (status) => {
      switch (status) {
        case 'INFLIGHT': return 'text-yellow-600';
        case 'CONFIRMING': return 'text-orange-600';
        case 'DELIVERED': return 'text-green-600';
        case 'FAILED': return 'text-red-600';
        default: return 'text-gray-600';
      }
    };

    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-4 hover:shadow-lg transition-shadow duration-300 mt-5">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Transaction Status</h3>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <img src={fromChain?.icon} alt={fromChain?.name} className="w-6 h-6" />
            <span className="font-medium text-gray-700">{fromChain?.name}</span>
            <ChevronRight className="text-gray-400" />
            <img src={toChain?.icon} alt={toChain?.name} className="w-6 h-6" />
            <span className="font-medium text-gray-700">{toChain?.name}</span>
          </div>
          {useCustomAddress && (
            <p className="text-sm">
              <span className="font-medium text-gray-700">To Address:</span> {toAddress}
            </p>
          )}
          {message && (
            <p className="text-sm">
              <span className="font-medium text-gray-700">Status: </span>
              <span className={`font-medium ${getStatusColor(message.status)}`}>
                {message.status}
              </span>
            </p>
          )}
          <div className="flex flex-wrap gap-4 pt-2">
            <a
              href={explorerUrlSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center text-blue-500 hover:text-blue-600 transition-colors duration-300"
            >
              <ExternalLink size={16} className="mr-1" />
              Source Tx
            </a>
            {message?.dstTxHash && (
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
            <a
              href={layerZeroExplorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center text-blue-500 hover:text-blue-600 transition-colors duration-300"
            >
              <ExternalLink size={16} className="mr-1" />
              LayerZero Explorer
            </a>
          </div>
        </div>
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
      </div>
    );
  };


  const getBalanceDisplay = (balance, isLoading, label, isNewBalance = false) => {
    let displayValue = 'N/A';
    if (isLoading) {
      displayValue = 'Loading...';
    } else if (balance !== null && balance !== undefined) {
      displayValue = `${parseFloat(formatEther(balance)).toFixed(4)} TREAT`;
    }

    return (
      <div className={`${isNewBalance ? 'mt-2 text-sm' : ''}`}>
        <h3 className="text-sm font-medium text-gray-500">{label}</h3>
        <p className={`mt-1 font-semibold text-gray-900 ${isNewBalance ? 'text-base' : 'text-2xl'}`}>
          {displayValue}
        </p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-100 to-white py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="bg-pink-600 px-4 sm:p-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <img src={treatLogo} alt="Treat Logo" className="w-10 h-10 mr-2" />
                <h1 className="text-3xl font-bold text-center text-white m-0">Treat Bridge</h1>
              </div>
              <ConnectButton />
            </div>
          </div>
          <div className="px-4 py-6 sm:p-8">
            <div className={`grid grid-cols-1 sm:grid-cols-7 gap-4 sm:gap-6 mb-8 ${isApprovalInProgress || isTransactionInProgress ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="sm:col-span-3 space-y-4">
                <h2 className="text-xl font-semibold text-gray-700">From</h2>
                <div className={isTransactionInProgress ? "opacity-50 pointer-events-none" : ""}>
                  <CustomDropdown
                    options={Object.values(chainConfigs)}
                    value={fromChain?.name}
                    onChange={handleFromChainChange}
                    disabled={isTransactionInProgress}
                  />
                </div>
                {fromChain && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    {getBalanceDisplay(fromBalance?.value, isFromBalanceLoading, "Current Balance")}
                    {newFromBalance && getBalanceDisplay(parseEther(newFromBalance), false, "New Balance After Transfer", true)}
                  </div>
                )}
              </div>

              <div className="sm:col-span-1 flex items-center justify-center">
                <button
                  onClick={handleSwapChains}
                  className={`text-pink-600 hover:text-pink-700 transition-colors p-2 rounded-full bg-pink-100 hover:bg-pink-200 ${isTransactionInProgress ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Click to swap chains"
                  disabled={isTransactionInProgress}
                >
                  <ArrowLeftRight size={24} />
                </button>
              </div>

              <div className="sm:col-span-3 space-y-4">
                <h2 className="text-xl font-semibold text-gray-700">To</h2>
                <div className={isTransactionInProgress ? "opacity-50 pointer-events-none" : ""}>
                  <CustomDropdown
                    options={Object.values(chainConfigs)}
                    value={toChain?.name}
                    onChange={handleToChainChange}
                    disabled={isTransactionInProgress}
                  />
                </div>
                {toChain && !useCustomAddress && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    {getBalanceDisplay(toBalance?.value, isToBalanceLoading, "Current Balance")}
                    {newToBalance && getBalanceDisplay(parseEther(newToBalance), false, "New Balance After Transfer", true)}
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="useCustomAddress"
                      checked={useCustomAddress}
                      onChange={(e) => {
                        setUseCustomAddress(e.target.checked);
                        if (!e.target.checked) {
                          resetTransactionStatus();
                        }
                      }}
                      className="form-checkbox h-4 w-4 text-pink-600 transition duration-150 ease-in-out"
                      disabled={isTransactionInProgress}
                    />
                    <label htmlFor="useCustomAddress" className="text-sm text-gray-700">
                      Send to a different address
                    </label>
                  </div>
                  {useCustomAddress && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={toAddress}
                        onChange={handleToAddressChange}
                        placeholder="Enter destination address"
                        className={`w-full px-3 py-2 text-sm border-2 border-gray-300 rounded-md focus:ring-pink-500 focus:border-pink-500 shadow-sm ${!isValidAddress && toAddress ? 'border-red-500' : ''}`}
                        disabled={isTransactionInProgress}
                      />
                      {!isValidAddress && toAddress && (
                        <p className="text-sm text-red-600">Invalid Ethereum address</p>
                      )}
                      <p className="text-xs text-red-600">
                        Warning: If you send tokens to an address that isn't yours, we cannot recover them.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={`space-y-6 mb-8 ${isApprovalInProgress || isTransactionInProgress ? 'opacity-50 pointer-events-none' : ''}`}>
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
                        const percentage = (parseEther(value) * BigInt(100) / fromBalance.value).toString();
                        setPercentageToTransfer(Math.min(Number(percentage), 100));
                      }
                    }
                  }}
                  placeholder="0.0"
                  className="focus:ring-pink-500 focus:border-pink-500 block w-full pl-3 pr-20 py-3 sm:text-sm border-2 border-gray-300 rounded-md shadow-sm"
                  disabled={isTransactionInProgress}
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 sm:text-sm">TREAT</span>
                </div>
              </div>
              <div className={`space-y-2 ${isTransactionInProgress ? 'opacity-50 pointer-events-none' : ''}`}>
                <ReactSlider
                  className="w-full h-2 bg-gray-200 rounded-md"
                  thumbClassName="w-6 h-6 bg-pink-500 rounded-full focus:ouåtline-none focus:ring-2 focus:ring-pink-400 -mt-2"
                  trackClassName="h-2 bg-pink-300 rounded-md"
                  value={percentageToTransfer}
                  onChange={handleSliderChange}
                  min={0}
                  max={100}
                  disabled={isTransactionInProgress}
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>0%</span>
                  <span className="font-bold text-sm">{percentageToTransfer}%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-center text-gray-600 min-h-5">
                {

                  estimatedGas && (
                    <> Estimated Gas Fee: {
                      !estimatedGas ? 'Calculating...' :
                        estimatedGas.nativeFee ? `${formatEther(estimatedGas.nativeFee)} ${fromChain?.nativeCurrency}` :
                          'Unable to estimate'
                    }</>
                  )
                }
              </p>
              {renderActionButton()}
              {(error || gasFeeError || approvalGasError) && (
                <p className="text-sm text-center text-red-600">
                  {error || gasFeeError || approvalGasError}
                </p>
              )}
              {(isLzLoading) && (
                <LoadingSpinner
                  loading={isLzLoading || isApprovalInProgress}
                  message={isLzLoading ? "Waiting for LayerZero confirmation..." : "Waiting for approval confirmation..."}
                />
              )}
            </div>
          </div>
        </div>

        {/* Show transaction status card when a transaction is in progress or when showTransactionStatus is true */}
        {(showTransactionStatus || transactionState !== 'idle') && (txHash || lzMessage) && currentTransactionType === 'bridge' && (
          <TransactionStatusCard
            message={lzMessage}
            fromChain={fromChain}
            toChain={toChain}
            txHash={txHash}
            toAddress={toAddress}
            useCustomAddress={useCustomAddress}
          />
        )}
        {eventLogs.map((log, index) => (
          <EventCard key={index} event={log} chainConfig={fromChain} />
        ))}
      </div>
    </div>
  );
};

export default TreatBridge;
