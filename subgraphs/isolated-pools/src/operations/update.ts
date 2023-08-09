import { Address, BigInt, Bytes } from '@graphprotocol/graph-ts';

import { PoolMetadataUpdatedNewMetadataStruct } from '../../generated/PoolRegistry/PoolRegistry';
import { AccountVToken, Market } from '../../generated/schema';
import { VToken } from '../../generated/templates/VToken/VToken';
import { zeroBigInt32 } from '../constants';
import { exponentToBigDecimal, getExchangeRateBigDecimal } from '../utilities';
import { getTokenPriceInUsd } from '../utilities';
import { getOrCreateMarket } from './getOrCreate';
import {
  getOrCreateAccount,
  getOrCreateAccountVToken,
  getOrCreateAccountVTokenTransaction,
} from './getOrCreate';
import { getOrCreatePool } from './getOrCreate';

const updateAccountVToken = (
  marketAddress: Address,
  marketSymbol: string,
  accountAddress: Address,
  txHash: Bytes,
  timestamp: BigInt,
  blockNumber: BigInt,
  logIndex: BigInt,
): AccountVToken => {
  getOrCreateAccount(accountAddress);
  const accountVToken = getOrCreateAccountVToken(
    marketSymbol,
    accountAddress,
    marketAddress,
    false,
  );
  getOrCreateAccountVTokenTransaction(
    accountAddress,
    txHash,
    timestamp,
    blockNumber,
    logIndex,
    marketAddress,
  );
  accountVToken.accrualBlockNumber = blockNumber;
  return accountVToken as AccountVToken;
};

export const updateAccountVTokenBorrow = (
  marketAddress: Address,
  marketSymbol: string,
  accountAddress: Address,
  txHash: Bytes,
  timestamp: BigInt,
  blockNumber: BigInt,
  logIndex: BigInt,
  accountBorrows: BigInt,
  borrowIndexMantissa: BigInt,
): AccountVToken => {
  const accountVToken = updateAccountVToken(
    marketAddress,
    marketSymbol,
    accountAddress,
    txHash,
    timestamp,
    blockNumber,
    logIndex,
  );
  accountVToken.accountBorrowBalanceMantissa = accountBorrows;
  accountVToken.accountBorrowIndexMantissa = borrowIndexMantissa;
  accountVToken.save();
  return accountVToken as AccountVToken;
};

export const updateAccountVTokenRepayBorrow = (
  marketAddress: Address,
  marketSymbol: string,
  accountAddress: Address,
  txHash: Bytes,
  timestamp: BigInt,
  blockNumber: BigInt,
  logIndex: BigInt,
  accountBorrows: BigInt,
  borrowIndexMantissa: BigInt,
): AccountVToken => {
  const accountVToken = updateAccountVToken(
    marketAddress,
    marketSymbol,
    accountAddress,
    txHash,
    timestamp,
    blockNumber,
    logIndex,
  );
  accountVToken.accountBorrowBalanceMantissa = accountBorrows;
  accountVToken.accountBorrowIndexMantissa = borrowIndexMantissa;
  accountVToken.save();
  return accountVToken as AccountVToken;
};

export const updateAccountVTokenTransferFrom = (
  marketAddress: Address,
  marketSymbol: string,
  accountAddress: Address,
  txHash: Bytes,
  timestamp: BigInt,
  blockNumber: BigInt,
  logIndex: BigInt,
  amount: BigInt,
  exchangeRate: BigInt,
  underlyingDecimals: i32,
  vTokenDecimals: i32,
): AccountVToken => {
  const exchangeRateBigDecimal = getExchangeRateBigDecimal(
    exchangeRate,
    underlyingDecimals,
    vTokenDecimals,
  );
  const amountUnderlyingMantissa = exchangeRateBigDecimal
    .times(exponentToBigDecimal(underlyingDecimals))
    .times(amount.toBigDecimal());

  const accountVToken = updateAccountVToken(
    marketAddress,
    marketSymbol,
    accountAddress,
    txHash,
    timestamp,
    blockNumber,
    logIndex,
  );

  accountVToken.totalUnderlyingRedeemedMantissa =
    accountVToken.totalUnderlyingRedeemedMantissa.plus(amountUnderlyingMantissa);
  accountVToken.save();
  return accountVToken as AccountVToken;
};

export const updateAccountVTokenTransferTo = (
  marketAddress: Address,
  marketSymbol: string,
  accountAddress: Address,
  txHash: Bytes,
  timestamp: BigInt,
  blockNumber: BigInt,
  logIndex: BigInt,
): AccountVToken => {
  const accountVToken = updateAccountVToken(
    marketAddress,
    marketSymbol,
    accountAddress,
    txHash,
    timestamp,
    blockNumber,
    logIndex,
  );

  accountVToken.save();
  return accountVToken as AccountVToken;
};

export const updateMarket = (
  vTokenAddress: Address,
  blockNumber: i32,
  blockTimestamp: i32,
): Market => {
  const market = getOrCreateMarket(vTokenAddress);

  // Only updateMarket if it has not been updated this block
  if (market.accrualBlockNumber === blockNumber) {
    return market as Market;
  }
  const marketContract = VToken.bind(vTokenAddress);

  const tokenPriceUsd = getTokenPriceInUsd(
    marketContract.comptroller(),
    vTokenAddress,
    market.underlyingDecimals,
  );
  market.underlyingPriceUsd = tokenPriceUsd.truncate(market.underlyingDecimals);

  market.accrualBlockNumber = marketContract.accrualBlockNumber().toI32();
  market.blockTimestamp = blockTimestamp;

  market.exchangeRateMantissa = marketContract.exchangeRateStored();

  market.borrowIndexMantissa = marketContract.borrowIndex();

  market.reservesMantissa = marketContract.totalReserves();

  market.cash = marketContract
    .getCash()
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals);

  // calling supplyRatePerBlock & borrowRatePerBlock can fail due to external reasons, so we fall back to 0 in case of an error
  const borrowRatePerBlockResult = marketContract.try_borrowRatePerBlock();
  if (borrowRatePerBlockResult.reverted) {
    market.borrowRateMantissa = zeroBigInt32;
  } else {
    market.borrowRateMantissa = borrowRatePerBlockResult.value;
  }

  const supplyRatePerBlockResult = marketContract.try_supplyRatePerBlock();
  if (supplyRatePerBlockResult.reverted) {
    market.supplyRateMantissa = zeroBigInt32;
  } else {
    market.supplyRateMantissa = supplyRatePerBlockResult.value;
  }

  market.treasuryTotalBorrowsMantissa = marketContract.totalBorrows();
  market.treasuryTotalSupplyMantissa = marketContract.totalSupply();

  market.save();
  return market as Market;
};

export function updatePoolMetadata(
  comptroller: Address,
  newMetadata: PoolMetadataUpdatedNewMetadataStruct,
): void {
  const pool = getOrCreatePool(comptroller);
  if (pool) {
    pool.category = newMetadata.category;
    pool.logoUrl = newMetadata.logoURL;
    pool.description = newMetadata.description;
    pool.save();
  }
}
