// scratch/check_db_payout_records.js
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let supabaseUrl = 'https://wfovneedmwetxnzhhobh.supabase.co';
let supabaseKey = 'sb_publishable_DhB-vComPXsCPe8Svn1n1w_DRCRPfw6';

['c:\\Projects\\KashiVeda\\.env', 'c:\\Projects\\kashi-veda-admin\\.env.local', 'c:\\Projects\\kashi-veda-admin\\.env'].forEach(envPath => {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [k, ...v] = trimmed.split('=');
        const val = v.join('=').trim().replace(/^["']|["']$/g, '');
        if (k.includes('SUPABASE_URL')) supabaseUrl = val;
        if (k === 'SUPABASE_SERVICE_ROLE_KEY') supabaseKey = val;
        if (!supabaseKey && (k.includes('ANON_KEY') || k.includes('PUBLISHABLE_KEY'))) supabaseKey = val;
      }
    });
  }
});

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  console.log('--- INSPECTING DATABASE RECORDS FOR PAYOUTS & EARNINGS ---');

  // 1. Check pandit_payouts table count and rows
  const { data: payouts, error: pErr } = await supabase
    .from('pandit_payouts')
    .select('id, pandit_id, booking_id, kundli_order_id, gross_amount, platform_fee, net_amount, status, created_at, released_at');
  
  console.log('\n1. PUBLIC.PANDIT_PAYOUTS RECORDS:');
  if (pErr) console.error('Error fetching pandit_payouts:', pErr);
  else console.log(`Found ${payouts.length} records:`, JSON.stringify(payouts, null, 2));

  // 2. Check bookings and their statuses
  const { data: bookings, error: bErr } = await supabase
    .from('bookings')
    .select('id, booking_number, pandit_id, status, payment_status, total_price, advance_amount, completed_at, created_at');

  console.log('\n2. PUBLIC.BOOKINGS RECORDS:');
  if (bErr) console.error('Error fetching bookings:', bErr);
  else {
    console.log(`Found ${bookings.length} bookings:`);
    bookings.forEach(b => {
      console.log(`- Booking #${b.booking_number} (${b.id}): status="${b.status}", payment_status="${b.payment_status}", total_price=₹${b.total_price}, pandit_id=${b.pandit_id}, completed_at=${b.completed_at}`);
    });
  }

  // 3. Check booking_payments
  const { data: payments, error: pmErr } = await supabase
    .from('booking_payments')
    .select('id, booking_id, amount, payment_type, status, captured_at');
  
  console.log('\n3. PUBLIC.BOOKING_PAYMENTS RECORDS:');
  if (pmErr) console.error('Error fetching booking_payments:', pmErr);
  else {
    console.log(`Found ${payments?.length || 0} booking payments:`, JSON.stringify(payments, null, 2));
  }

  // 4. Check kundli_orders
  const { data: kundli, error: kErr } = await supabase
    .from('kundli_orders')
    .select('id, pandit_id, status, payment_status, total_price, completed_at');

  console.log('\n4. PUBLIC.KUNDLI_ORDERS RECORDS:');
  if (kErr) console.error('Error fetching kundli_orders:', kErr);
  else {
    console.log(`Found ${kundli?.length || 0} kundli orders:`, JSON.stringify(kundli, null, 2));
  }

  // 5. Check pandit_profiles and bank accounts
  const { data: pandits, error: pdErr } = await supabase
    .from('pandit_profiles')
    .select(`id, user_id, verification_status, profile:profiles!pandit_profiles_user_id_fkey(display_name), bank_accounts:pandit_bank_accounts(id, bank_name, verification_status, is_default)`);

  console.log('\n5. PUBLIC.PANDIT_PROFILES & BANK ACCOUNTS:');
  if (pdErr) console.error('Error fetching pandits:', pdErr);
  else {
    console.log(`Found ${pandits?.length || 0} pandit profiles:`, JSON.stringify(pandits, null, 2));
  }

  // 6. Test Migration 042 RPC existence
  console.log('\n6. CHECKING MIGRATION 042 RPC AVAILABILITY:');
  const { data: rpc1, error: rpc1Err } = await supabase.rpc('get_pandit_payout_summaries', { p_search: null, p_status: null, p_limit: 10, p_offset: 0 });
  if (rpc1Err) {
    console.log('RPC get_pandit_payout_summaries call failed:', rpc1Err.message, '(Code: ' + rpc1Err.code + ')');
  } else {
    console.log('RPC get_pandit_payout_summaries succeeded! Result:', JSON.stringify(rpc1, null, 2));
  }
}

inspect().catch(err => console.error('Fatal inspection error:', err));
