// scratch/verify_credentials.js
const readline = require('readline');
const crypto = require('crypto');

const TARGET_KEY_HASH = 'ec797e34d4c6b2ef819f833c621183b7c8e930659aed8af0e5f05231d3d34762';
const TARGET_SECRET_HASH = 'c89c3776e2ac53d9236d3b4ddbf92d6e4deb0783add2d5a5eaaddaf406ad4f73';

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log('====================================================');
console.log('   LiveKit Cloud Credential Comparison Utility      ');
console.log('====================================================');
console.log('This utility compares your LiveKit Cloud credentials');
console.log('against the active runtime fingerprints in Supabase.');
console.log('Values are NEVER printed, logged, or saved to disk.\n');

rl.question('Paste your LiveKit Cloud API Key: ', (rawApiKey) => {
  rl.question('Paste your LiveKit Cloud API Secret: ', (rawApiSecret) => {
    rl.close();

    const apiKey = rawApiKey ? rawApiKey.trim() : '';
    const apiSecret = rawApiSecret ? rawApiSecret.trim() : '';

    const apiKeyHasWhitespace = Boolean(rawApiKey && rawApiKey !== apiKey);
    const apiSecretHasWhitespace = Boolean(rawApiSecret && rawApiSecret !== apiSecret);

    const inputKeyHash = sha256(apiKey);
    const inputSecretHash = sha256(apiSecret);

    const keyMatch = inputKeyHash === TARGET_KEY_HASH;
    const secretMatch = inputSecretHash === TARGET_SECRET_HASH;

    console.log('\n================ Comparison Result ================');
    console.log(`API Key:    ${keyMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
    if (apiKeyHasWhitespace) {
      console.log('  ⚠️ Note: Entered API Key contained leading/trailing whitespace.');
    }

    console.log(`API Secret: ${secretMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
    if (apiSecretHasWhitespace) {
      console.log('  ⚠️ Note: Entered API Secret contained leading/trailing whitespace.');
    }
    console.log('====================================================\n');
  });
});
