#!/usr/bin/env tsx
/**
 * Register DPO2U AuditorAgent DID on Hedera Testnet via HCS-10
 *
 * Usage: npm run register:hedera-did
 *
 * Prerequisites:
 *   - HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in .env
 *   - Funded Hedera testnet account (https://portal.hedera.com/faucet)
 */

import 'dotenv/config';
import { registerAgentDID } from '../src/hedera/hcs10-identity.js';

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  DPO2U — Register AuditorAgent DID (HCS-10)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  const network = process.env.HEDERA_NETWORK || 'testnet';

  if (!operatorId || !operatorKey) {
    console.error('Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY in .env');
    console.error('Get a testnet account at: https://portal.hedera.com/faucet');
    process.exitCode = 1;
    return;
  }

  const identity = await registerAgentDID({
    operatorId,
    operatorKey,
    network,
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Registration complete');
  console.log(`  DID: ${identity.did}`);
  console.log(`  Add to .env: HEDERA_AGENT_TOPIC_ID=${identity.topicId}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch((error) => {
  console.error('Registration failed:', error);
  process.exitCode = 1;
});
