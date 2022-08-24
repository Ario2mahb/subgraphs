import { Address, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts';
import { newMockEvent } from 'matchstick-as';

import { VoteCast as VoteCastAlpha } from '../../generated/GovernorAlpha/GovernorAlpha';
import { VoteCast as VoteCastBravo } from '../../generated/GovernorBravoDelegate/GovernorBravoDelegate';

export function createProposalCreatedEvent<E>(
  id: i32,
  proposer: Address,
  targets: Address[],
  values: BigInt[],
  signatures: string[],
  calldatas: Bytes[],
  startBlock: BigInt,
  endBlock: BigInt,
  description: string,
): E {
  const event = changetype<E>(newMockEvent());
  event.parameters = [];

  const idParam = new ethereum.EventParam('id', ethereum.Value.fromI32(id));
  event.parameters.push(idParam);

  const proposerParam = new ethereum.EventParam('proposer', ethereum.Value.fromAddress(proposer));
  event.parameters.push(proposerParam);

  const targetsParam = new ethereum.EventParam('targets', ethereum.Value.fromAddressArray(targets));
  event.parameters.push(targetsParam);

  const valuesParam = new ethereum.EventParam(
    'values',
    ethereum.Value.fromUnsignedBigIntArray(values),
  );
  event.parameters.push(valuesParam);

  const signaturesParam = new ethereum.EventParam(
    'signatures',
    ethereum.Value.fromStringArray(signatures),
  );
  event.parameters.push(signaturesParam);

  const calldatasParam = new ethereum.EventParam(
    'calldatas',
    ethereum.Value.fromBytesArray(calldatas),
  );
  event.parameters.push(calldatasParam);

  const startBlockParam = new ethereum.EventParam(
    'startBlock',
    ethereum.Value.fromUnsignedBigInt(startBlock),
  );
  event.parameters.push(startBlockParam);

  const endBlockParam = new ethereum.EventParam(
    'endBlock',
    ethereum.Value.fromUnsignedBigInt(endBlock),
  );
  event.parameters.push(endBlockParam);

  const descriptionParam = new ethereum.EventParam(
    'description',
    ethereum.Value.fromString(description),
  );
  event.parameters.push(descriptionParam);

  return event;
}

export function createProposalCanceledEvent<E>(id: i32): E {
  const event = changetype<E>(newMockEvent());
  event.parameters = [];

  const idParam = new ethereum.EventParam('id', ethereum.Value.fromI32(id));
  event.parameters.push(idParam);
  return event;
}

export function createProposalQueuedEvent<E>(id: i32, eta: BigInt): E {
  const event = changetype<E>(newMockEvent());
  event.parameters = [];

  const idParam = new ethereum.EventParam('id', ethereum.Value.fromI32(id));
  event.parameters.push(idParam);

  const etaParam = new ethereum.EventParam('eta', ethereum.Value.fromUnsignedBigInt(eta));
  event.parameters.push(etaParam);

  return event;
}

export function createProposalExecutedEvent<E>(id: i32): E {
  const event = changetype<E>(newMockEvent());
  event.parameters = [];

  const idParam = new ethereum.EventParam('id', ethereum.Value.fromI32(id));
  event.parameters.push(idParam);

  return event;
}

export function createVoteCastAlphaEvent(
  voter: Address,
  proposalId: i32,
  support: boolean,
  votes: BigInt,
): VoteCastAlpha {
  const event = changetype<VoteCastAlpha>(newMockEvent());
  event.parameters = [];

  const voterParam = new ethereum.EventParam('voter', ethereum.Value.fromAddress(voter));
  event.parameters.push(voterParam);

  const proposalIdParam = new ethereum.EventParam('proposalId', ethereum.Value.fromI32(proposalId));
  event.parameters.push(proposalIdParam);

  const supportParam = new ethereum.EventParam('proposalId', ethereum.Value.fromBoolean(support));
  event.parameters.push(supportParam);

  const votesParam = new ethereum.EventParam('votes', ethereum.Value.fromUnsignedBigInt(votes));
  event.parameters.push(votesParam);

  return event;
}

export function createVoteCastBravoEvent(
  voter: Address,
  proposalId: i32,
  support: i32,
  votes: BigInt,
  reason: string,
): VoteCastBravo {
  const event = changetype<VoteCastBravo>(newMockEvent());
  event.parameters = [];

  const voterParam = new ethereum.EventParam('voter', ethereum.Value.fromAddress(voter));
  event.parameters.push(voterParam);

  const proposalIdParam = new ethereum.EventParam('proposalId', ethereum.Value.fromI32(proposalId));
  event.parameters.push(proposalIdParam);

  const supportParam = new ethereum.EventParam('proposalId', ethereum.Value.fromI32(support));
  event.parameters.push(supportParam);

  const votesParam = new ethereum.EventParam('votes', ethereum.Value.fromUnsignedBigInt(votes));
  event.parameters.push(votesParam);

  const reasonParam = new ethereum.EventParam('reason', ethereum.Value.fromString(reason));
  event.parameters.push(reasonParam);

  return event;
}
