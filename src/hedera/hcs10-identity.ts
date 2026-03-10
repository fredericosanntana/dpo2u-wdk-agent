/**
 * HCS-10 Identity Registration for DPO2U Agents
 *
 * Registers the AuditorAgent as a DID on Hedera Testnet using the HCS-10 standard,
 * enabling agent-to-agent discovery via the OpenClaw platform.
 */

import 'dotenv/config';

export interface HCS10AgentIdentity {
  did: string;
  topicId: string;
  inboundTopicId: string;
  outboundTopicId: string;
  network: string;
}

/**
 * Register the AuditorAgent DID via HCS-10 on Hedera Testnet.
 *
 * Uses @hashgraphonline/standards-sdk HCS10Client + AgentBuilder to create
 * an agent identity with compliance-audit capabilities discoverable by other agents.
 */
export async function registerAgentDID(options: {
  operatorId: string;
  operatorKey: string;
  network?: string;
  agentName?: string;
  agentDescription?: string;
}): Promise<HCS10AgentIdentity> {
  const {
    operatorId,
    operatorKey,
    network = 'testnet',
    agentName = 'DPO2U AuditorAgent',
    agentDescription = 'Autonomous LGPD/GDPR compliance auditor with cross-chain attestation relay (Midnight → Hedera)',
  } = options;

  // Dynamic import to allow tree-shaking when not used
  const { HCS10Client, AgentBuilder, AIAgentCapability, AIAgentType } =
    await import('@hashgraphonline/standards-sdk');

  const client = new HCS10Client({
    network,
    operatorId,
    operatorKey,
    logLevel: 'info',
  });

  console.log(`[hcs10] Registering agent DID on Hedera ${network}...`);
  console.log(`[hcs10] Operator: ${operatorId}`);

  // Build agent profile via AgentBuilder
  const agentBuilder = new AgentBuilder()
    .setName(agentName)
    .setDescription(agentDescription)
    .setType(AIAgentType.AUTONOMOUS)
    .setCapabilities([
      AIAgentCapability.COMPLIANCE_ANALYSIS,
      AIAgentCapability.SMART_CONTRACT_AUDIT,
      AIAgentCapability.MULTI_AGENT_COORDINATION,
      AIAgentCapability.DATA_INTEGRATION,
    ])
    .addProperty('domain', 'compliance-audit')
    .addProperty('frameworks', 'LGPD,GDPR,MiCA')
    .addProperty('chains', 'midnight,hedera,base,polkadot')
    .addProperty('skill', 'openclaw-compliance');

  // Create the agent identity on Hedera
  const result = await client.createAgent(agentBuilder);

  const identity: HCS10AgentIdentity = {
    did: `did:hedera:${network}:${result.metadata.accountId}`,
    topicId: result.metadata.inboundTopicId,
    inboundTopicId: result.metadata.inboundTopicId,
    outboundTopicId: result.metadata.outboundTopicId,
    network,
  };

  console.log(`[hcs10] Agent DID registered successfully:`);
  console.log(`  DID:      ${identity.did}`);
  console.log(`  Topic:    ${identity.topicId}`);
  console.log(`  Inbound:  ${identity.inboundTopicId}`);
  console.log(`  Outbound: ${identity.outboundTopicId}`);

  return identity;
}

/**
 * Retrieve agent info for a previously registered DID.
 */
export async function getAgentInfo(options: {
  operatorId: string;
  operatorKey: string;
  agentTopicId: string;
  network?: string;
}): Promise<unknown> {
  const { operatorId, operatorKey, agentTopicId, network = 'testnet' } = options;

  const { HCS10Client } = await import('@hashgraphonline/standards-sdk');

  const client = new HCS10Client({
    network,
    operatorId,
    operatorKey,
  });

  const info = await client.retrieveProfile(agentTopicId);
  return info;
}
