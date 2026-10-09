// scratch/test_payout_columns.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://wfovneedmwetxnzhhobh.supabase.co',
  'sb_publishable_DhB-vComPXsCPe8Svn1n1w_DRCRPfw6'
);

async function check() {
  console.log('Checking pandit_payouts query structure...');
  // Check what columns are supported
  const { data, error } = await supabase
    .from('pandit_payouts')
    .select('id, net_amount, gross_amount, platform_fee, status, released_at, transaction_reference, payment_method, confirmed_at');

  console.log('Query result with migration 042 columns:', { data, error });
}

check();
