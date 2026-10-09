// scratch/check_bookings_table_clean.js
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

let supabaseUrl = 'https://wfovneedmwetxnzhhobh.supabase.co';
let supabaseKey = 'sb_publishable_DhB-vComPXsCPe8Svn1n1w_DRCRPfw6';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectBookings() {
  console.log('--- INSPECTING BOOKINGS & PUJA SERVICES ---');

  // Query bookings with exact valid columns
  const { data: bookings, error: bErr } = await supabase
    .from('bookings')
    .select('id, booking_number, service_mode, status, scheduled_start_at, total_amount, advance_amount, balance_amount, created_at, completed_at, pandit_id');

  if (bErr) {
    console.error('Bookings query error:', bErr);
  } else {
    console.log(`Total bookings found: ${bookings?.length || 0}`);
    console.log('Bookings summary:', JSON.stringify(bookings, null, 2));
  }

  // Query payment_orders
  const { data: orders, error: oErr } = await supabase
    .from('payment_orders')
    .select('id, booking_id, purpose, amount, status, created_at');

  if (oErr) {
    console.error('Payment orders query error:', oErr);
  } else {
    console.log(`Total payment orders found: ${orders?.length || 0}`);
    console.log('Payment orders:', JSON.stringify(orders, null, 2));
  }

  // Query payment_transactions
  const { data: txs, error: tErr } = await supabase
    .from('payment_transactions')
    .select('id, payment_order_id, amount, status, paid_at');

  if (tErr) {
    console.error('Payment transactions query error:', tErr);
  } else {
    console.log(`Total payment transactions found: ${txs?.length || 0}`);
    console.log('Payment transactions:', JSON.stringify(txs, null, 2));
  }
}

inspectBookings().catch(console.error);
