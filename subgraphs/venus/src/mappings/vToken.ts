/* eslint-disable prefer-const */
// to satisfy AS compiler
import {
  Account,
  BorrowEvent,
  LiquidationEvent,
  Market,
  RepayEvent,
  TransferEvent,
} from '../../generated/schema';
import {
  AccrueInterest,
  Borrow,
  LiquidateBorrow,
  MintBehalf as MintBehalfV1,
  Mint as MintV1,
  NewMarketInterestRateModel,
  NewReserveFactor,
  Redeem as RedeemV1,
  RepayBorrow,
  Transfer,
} from '../../generated/templates/VToken/VToken';
import { VToken as VTokenContract } from '../../generated/templates/VToken/VToken';
import {
  Mint,
  MintBehalf,
  Redeem,
} from '../../generated/templates/VTokenUpdatedEvents/VTokenUpdatedEvents';
import { DUST_THRESHOLD, oneBigInt, zeroBigInt32 } from '../constants';
import { nullAddress } from '../constants/addresses';
import {
  createAccount,
  createMarket,
  createMintBehalfEvent,
  createMintEvent,
  createRedeemEvent,
} from '../operations/create';
import { updateCommonVTokenStats } from '../operations/update';
import { updateMarket } from '../operations/update';
import { exponentToBigInt } from '../utilities/exponentToBigInt';
import { getMarketId, getTransactionId } from '../utilities/ids';

/* Account supplies assets into market and receives vTokens in exchange
 *
 * event.mintAmount is the underlying asset
 * event.mintTokens is the amount of vTokens minted
 * event.minter is the account
 *
 * Notes
 *    Transfer event will always get emitted with this
 *    Mints originate from the vToken address, not 0x000000, which is typical of ERC-20s
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this
 *    No need to updateCommonVTokenStats, handleTransfer() will
 *    No need to update vTokenBalance, handleTransfer() will
 */
export const handleMint = (event: Mint): void => {
  let market = Market.load(event.address.toHexString());
  if (!market) {
    market = createMarket(event.address.toHexString());
  }

  createMintEvent<Mint>(event);

  if (event.params.mintTokens.equals(event.params.totalSupply)) {
    market.supplierCount = market.supplierCount.plus(oneBigInt);
    market.save();
  }
};

export const handleMintBehalf = (event: MintBehalf): void => {
  let market = Market.load(event.address.toHexString());
  if (!market) {
    market = createMarket(event.address.toHexString());
  }

  createMintBehalfEvent<MintBehalf>(event);

  if (event.params.mintTokens.equals(event.params.totalSupply)) {
    market.supplierCount = market.supplierCount.plus(oneBigInt);
    market.save();
  }
};

/*  Account supplies vTokens into market and receives underlying asset in exchange
 *
 *  event.redeemAmount is the underlying asset
 *  event.redeemTokens is the vTokens
 *  event.redeemer is the account
 *
 *  Notes
 *    Transfer event will always get emitted with this
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this
 *    No need to updateCommonVTokenStats, handleTransfer() will
 *    No need to update vTokenBalance, handleTransfer() will
 */
export const handleRedeem = (event: Redeem): void => {
  let market = Market.load(event.address.toHexString());
  if (!market) {
    market = createMarket(event.address.toHexString());
  }

  createRedeemEvent<Redeem>(event);

  if (event.params.totalSupply.equals(zeroBigInt32)) {
    // if the current balance is 0 then the user has withdrawn all their assets from this market
    market.supplierCount = market.supplierCount.minus(oneBigInt);
    market.save();
  }
};

/* Borrow assets from the protocol. All values either BNB or BEP20
 *
 * event.params.totalBorrows = of the whole market (not used right now)
 * event.params.accountBorrows = total of the account
 * event.params.borrowAmount = that was added in this event
 * event.params.borrower = the account
 * Notes
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this
 */
export const handleBorrow = (event: Borrow): void => {
  let market = Market.load(event.address.toHexString());
  if (!market) {
    market = createMarket(event.address.toHexString());
  }
  let accountID = event.params.borrower.toHex();
  let account = Account.load(accountID);
  if (account == null) {
    account = createAccount(accountID);
  }
  account.hasBorrowed = true;
  account.save();

  // Update vTokenStats common for all events, and return the stats to update unique
  // values for each event
  let vTokenStats = updateCommonVTokenStats(
    market.id,
    market.symbol,
    accountID,
    event.transaction.hash,
    event.block.timestamp,
    event.block.number,
    event.logIndex,
  );

  vTokenStats.storedBorrowBalanceMantissa = event.params.accountBorrows;

  vTokenStats.accountBorrowIndexMantissa = market.borrowIndexMantissa;
  vTokenStats.totalUnderlyingBorrowedMantissa = vTokenStats.totalUnderlyingBorrowedMantissa.plus(
    event.params.borrowAmount,
  );
  vTokenStats.save();

  let borrowID = event.transaction.hash
    .toHexString()
    .concat('-')
    .concat(event.transactionLogIndex.toString());

  let borrow = new BorrowEvent(borrowID);
  borrow.amountMantissa = event.params.borrowAmount;
  borrow.accountBorrowsMantissa = event.params.accountBorrows;
  borrow.borrower = event.params.borrower;
  borrow.blockNumber = event.block.number.toI32();
  borrow.blockTime = event.block.timestamp.toI32();
  borrow.underlyingSymbol = market.underlyingSymbol;
  borrow.save();

  if (event.params.accountBorrows == event.params.borrowAmount) {
    // if both the accountBorrows and the borrowAmount are the same, it means the account is a new borrower
    market.borrowerCount = market.borrowerCount.plus(oneBigInt);
    market.borrowerCountAdjusted = market.borrowerCountAdjusted.plus(oneBigInt);
    market.save();
  }
};

/* Repay some amount borrowed. Anyone can repay anyones balance
 *
 * event.params.totalBorrows = of the whole market (not used right now)
 * event.params.accountBorrows = total of the account (not used right now)
 * event.params.repayAmount = that was added in this event
 * event.params.borrower = the borrower
 * event.params.payer = the payer
 *
 * Notes
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this
 *    Once a account totally repays a borrow, it still has its account interest index set to the
 *    markets value. We keep this, even though you might think it would reset to 0 upon full
 *    repay.
 */
export const handleRepayBorrow = (event: RepayBorrow): void => {
  let market = Market.load(event.address.toHexString());
  if (!market) {
    market = createMarket(event.address.toHexString());
  }
  let accountID = event.params.borrower.toHex();
  let account = Account.load(accountID);
  if (account == null) {
    createAccount(accountID);
  }

  // Update vTokenStats common for all events, and return the stats to update unique
  // values for each event
  let vTokenStats = updateCommonVTokenStats(
    market.id,
    market.symbol,
    accountID,
    event.transaction.hash,
    event.block.timestamp,
    event.block.number,
    event.logIndex,
  );

  vTokenStats.storedBorrowBalanceMantissa = event.params.accountBorrows;

  vTokenStats.accountBorrowIndexMantissa = market.borrowIndexMantissa;
  vTokenStats.totalUnderlyingRepaidMantissa = vTokenStats.totalUnderlyingRepaidMantissa.plus(
    event.params.repayAmount,
  );
  vTokenStats.save();

  let repayID = event.transaction.hash
    .toHexString()
    .concat('-')
    .concat(event.transactionLogIndex.toString());

  let repay = new RepayEvent(repayID);
  repay.amountMantissa = event.params.repayAmount;
  repay.accountBorrowsMantissa = event.params.accountBorrows;
  repay.borrower = event.params.borrower;
  repay.blockNumber = event.block.number.toI32();
  repay.blockTime = event.block.timestamp.toI32();
  repay.underlyingSymbol = market.underlyingSymbol;
  repay.payer = event.params.payer;
  repay.save();

  if (event.params.accountBorrows.equals(zeroBigInt32)) {
    market.borrowerCount = market.borrowerCount.minus(oneBigInt);
    market.borrowerCountAdjusted = market.borrowerCountAdjusted.minus(oneBigInt);
    market.save();
  } else if (event.params.accountBorrows.le(DUST_THRESHOLD)) {
    // Sometimes a liquidator will leave dust behind. If this happens we'll adjust count
    // because the position only exists due to a technicality
    market.borrowerCountAdjusted = market.borrowerCountAdjusted.minus(oneBigInt);
    market.save();
  }
};

/*
 * Liquidate an account who has fell below the collateral factor.
 *
 * event.params.borrower - the borrower who is getting liquidated of their vTokens
 * event.params.vTokenCollateral - the market ADDRESS of the vtoken being liquidated
 * event.params.liquidator - the liquidator
 * event.params.repayAmount - the amount of underlying to be repaid
 * event.params.seizeTokens - vTokens seized (transfer event should handle this)
 *
 * Notes
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this.
 *    When calling this const, event RepayBorrow, and event Transfer will be called every
 *    time. This means we can ignore repayAmount. Seize tokens only changes state
 *    of the vTokens, which is covered by transfer. Therefore we only
 *    add liquidation counts in this handler.
 */
export const handleLiquidateBorrow = (event: LiquidateBorrow): void => {
  let liquidatorID = event.params.liquidator.toHex();
  let liquidator = Account.load(liquidatorID);
  if (liquidator == null) {
    liquidator = createAccount(liquidatorID);
  }
  liquidator.countLiquidator = liquidator.countLiquidator + 1;
  liquidator.save();

  let borrowerID = event.params.borrower.toHex();
  let borrower = Account.load(borrowerID);
  if (borrower == null) {
    borrower = createAccount(borrowerID);
  }
  borrower.countLiquidated = borrower.countLiquidated + 1;
  borrower.save();

  // For a liquidation, the liquidator pays down the borrow of the underlying
  // asset. They seize one of potentially many types of vToken collateral of
  // the underwater borrower. So we must get that address from the event, and
  // the repay token is the event.address
  let marketRepayToken = Market.load(event.address.toHexString());
  if (!marketRepayToken) {
    marketRepayToken = createMarket(event.address.toHexString());
  }
  let marketVTokenLiquidated = Market.load(event.params.vTokenCollateral.toHexString());
  if (!marketVTokenLiquidated) {
    marketVTokenLiquidated = createMarket(event.params.vTokenCollateral.toHexString());
  }
  let mintID = event.transaction.hash
    .toHexString()
    .concat('-')
    .concat(event.transactionLogIndex.toString());

  let liquidation = new LiquidationEvent(mintID);
  liquidation.amountMantissa = event.params.seizeTokens;
  liquidation.to = event.params.liquidator;
  liquidation.from = event.params.borrower;
  liquidation.blockNumber = event.block.number.toI32();
  liquidation.blockTime = event.block.timestamp.toI32();
  liquidation.underlyingSymbol = marketRepayToken.underlyingSymbol;
  liquidation.underlyingRepayAmountMantissa = event.params.repayAmount;
  liquidation.vTokenSymbol = marketVTokenLiquidated.symbol;
  liquidation.save();
};

/* Transferring of vTokens
 *
 * event.params.from = sender of vTokens
 * event.params.to = receiver of vTokens
 * event.params.amount = amount sent
 *
 * Notes
 *    Possible ways to emit Transfer:
 *      seize() - i.e. a Liquidation Transfer (does not emit anything else)
 *      redeemFresh() - i.e. redeeming your vTokens for underlying asset
 *      mintFresh() - i.e. you are lending underlying assets to create vtokens
 *      transfer() - i.e. a basic transfer
 *    This const handles all 4 cases. Transfer is emitted alongside the mint, redeem, and seize
 *    events. So for those events, we do not update vToken balances.
 */
export const handleTransfer = (event: Transfer): void => {
  // We only updateMarket() if accrual block number is not up to date. This will only happen
  // with normal transfers, since mint, redeem, and seize transfers will already run updateMarket()
  let marketId = getMarketId(event.address);
  let market = Market.load(marketId);
  if (!market) {
    market = createMarket(marketId);
  }
  if (market.accrualBlockNumber != event.block.number.toI32()) {
    market = updateMarket(event.address, event.block.number.toI32(), event.block.timestamp.toI32());
  }

  let amountUnderlying = market.exchangeRateMantissa
    .times(event.params.amount)
    .div(exponentToBigInt(18));

  // Checking if the tx is FROM the vToken contract (i.e. this will not run when minting)
  // If so, it is a mint, and we don't need to run these calculations
  let accountFromId = event.params.from.toHex();
  if (accountFromId != nullAddress.toHex()) {
    let accountFrom = Account.load(accountFromId);
    if (accountFrom == null) {
      createAccount(accountFromId);
    }

    // Update vTokenStats common for all events, and return the stats to update unique
    // values for each event
    let vTokenStatsFrom = updateCommonVTokenStats(
      market.id,
      market.symbol,
      accountFromId,
      event.transaction.hash,
      event.block.timestamp,
      event.block.number,
      event.logIndex,
    );

    vTokenStatsFrom.vTokenBalanceMantissa = vTokenStatsFrom.vTokenBalanceMantissa.minus(
      event.params.amount,
    );

    vTokenStatsFrom.totalUnderlyingRedeemedMantissa =
      vTokenStatsFrom.totalUnderlyingRedeemedMantissa.plus(amountUnderlying);
    vTokenStatsFrom.save();
  }

  // Checking if the tx is TO the vToken contract (i.e. this will not run when redeeming)
  // If so, we ignore it. this leaves an edge case, where someone who accidentally sends
  // vTokens to a vToken contract, where it will not get recorded. Right now it would
  // be messy to include, so we are leaving it out for now TODO fix this in future
  let accountToId = event.params.to.toHex();
  if (accountToId != marketId) {
    let accountTo = Account.load(accountToId);
    if (accountTo == null) {
      createAccount(accountToId);
    }

    // Update vTokenStats common for all events, and return the stats to update unique
    // values for each event
    let vTokenStatsTo = updateCommonVTokenStats(
      market.id,
      market.symbol,
      accountToId,
      event.transaction.hash,
      event.block.timestamp,
      event.block.number,
      event.logIndex,
    );

    vTokenStatsTo.vTokenBalanceMantissa = vTokenStatsTo.vTokenBalanceMantissa.plus(
      event.params.amount,
    );

    vTokenStatsTo.totalUnderlyingSuppliedMantissa =
      vTokenStatsTo.totalUnderlyingSuppliedMantissa.plus(amountUnderlying);
    vTokenStatsTo.save();
  }

  let transferId = getTransactionId(event.transaction.hash, event.transactionLogIndex);

  let transfer = new TransferEvent(transferId);
  transfer.amountMantissa = event.params.amount;
  transfer.to = event.params.to;
  transfer.from = event.params.from;
  transfer.blockNumber = event.block.number.toI32();
  transfer.blockTime = event.block.timestamp.toI32();
  transfer.vTokenSymbol = market.symbol;
  transfer.save();
};

export function handleAccrueInterest(event: AccrueInterest): void {
  updateMarket(event.address, event.block.number.toI32(), event.block.timestamp.toI32());
}

export const handleNewReserveFactor = (event: NewReserveFactor): void => {
  let marketID = event.address.toHex();
  let market = Market.load(marketID);
  if (!market) {
    market = createMarket(marketID);
  }
  market.reserveFactor = event.params.newReserveFactorMantissa;
  market.save();
};

export function handleNewMarketInterestRateModel(event: NewMarketInterestRateModel): void {
  let marketID = event.address.toHex();
  let market = Market.load(marketID);
  if (market == null) {
    market = createMarket(marketID);
  }
  market.interestRateModelAddress = event.params.newInterestRateModel;
  market.save();
}

export function handleMintV1(event: MintV1): void {
  let market = Market.load(event.address.toHexString());
  if (!market) {
    market = createMarket(event.address.toHexString());
  }

  createMintEvent<MintV1>(event);

  const vTokenContract = VTokenContract.bind(event.address);
  let totalSupply = vTokenContract.balanceOf(event.params.minter);

  if (event.params.mintTokens.equals(totalSupply)) {
    market.supplierCount = market.supplierCount.plus(oneBigInt);
    market.save();
  }
}

export function handleMintBehalfV1(event: MintBehalfV1): void {
  let market = Market.load(event.address.toHexString());
  if (!market) {
    market = createMarket(event.address.toHexString());
  }

  createMintBehalfEvent<MintBehalfV1>(event);

  const vTokenContract = VTokenContract.bind(event.address);
  let totalSupply = vTokenContract.balanceOf(event.params.receiver);

  if (event.params.mintTokens.equals(totalSupply)) {
    market.supplierCount = market.supplierCount.plus(oneBigInt);
    market.save();
  }
}

export function handleRedeemV1(event: RedeemV1): void {
  let market = Market.load(event.address.toHexString());
  if (!market) {
    market = createMarket(event.address.toHexString());
  }
  createRedeemEvent<RedeemV1>(event);

  const vTokenContract = VTokenContract.bind(event.address);
  let totalSupply = vTokenContract.balanceOf(event.params.redeemer);

  if (totalSupply.equals(zeroBigInt32)) {
    // if the current balance is 0 then the user has withdrawn all their assets from this market
    market.supplierCount = market.supplierCount.minus(oneBigInt);
    market.save();
  }
}
