const fs = require("fs");
const path = require("path");

const m056 = fs.readFileSync(path.resolve(__dirname, "../supabase/migrations/056_remediate_booking_and_payment_rpc_schema_compatibility.sql"), "utf8");
const m057 = fs.readFileSync(path.resolve(__dirname, "../supabase/migrations/057_fix_confirm_booking_payment_record_assignment.sql"), "utf8");
const m021 = fs.readFileSync(path.resolve(__dirname, "../supabase/migrations/021_booking_financial_lifecycle.sql"), "utf8");
const m061 = fs.readFileSync(path.resolve(__dirname, "../supabase/migrations/061_require_full_payment_within_24_hours.sql"), "utf8");

function extractFunction(sql, startStr, endStr) {
  const start = sql.indexOf(startStr);
  if (start === -1) throw new Error("Could not find start: " + startStr);
  const end = endStr ? sql.indexOf(endStr, start) : sql.length;
  if (end === -1) throw new Error("Could not find end: " + endStr);
  return sql.substring(start, end).trim();
}

const fn056_create = extractFunction(m056, "CREATE OR REPLACE FUNCTION public.create_or_validate_booking(", "-- =============================================================================\n-- 2. FUNCTION: public.request_booking_reschedule");
const fn061_create = extractFunction(m061, "CREATE OR REPLACE FUNCTION public.create_or_validate_booking(", "-- 2. FUNCTION: public.create_booking_balance_payment_order");

const fn057_confirm = extractFunction(m057, "CREATE OR REPLACE FUNCTION public.confirm_booking_payment(", null);
const fn061_confirm = extractFunction(m061, "CREATE OR REPLACE FUNCTION public.confirm_booking_payment(", null);

const fn021_bal = extractFunction(m021, "CREATE OR REPLACE FUNCTION public.create_booking_balance_payment_order(", "-- =============================================================================\n-- 4. Business Function: preview_cancellation_refund");
const fn061_bal = extractFunction(m061, "CREATE OR REPLACE FUNCTION public.create_booking_balance_payment_order(", "-- 3. FUNCTION: public.confirm_booking_payment");

function simpleLineDiff(name, strA, strB) {
  console.log(`\n=======================================================`);
  console.log(`DIFF: ${name}`);
  console.log(`=======================================================`);
  const linesA = strA.split(/\r?\n/);
  const linesB = strB.split(/\r?\n/);

  let iA = 0, iB = 0;
  while (iA < linesA.length || iB < linesB.length) {
    if (linesA[iA] === linesB[iB]) {
      iA++;
      iB++;
    } else {
      // Lookahead match
      let matchA = -1, matchB = -1;
      for (let look = 1; look < 40; look++) {
        if (iB + look < linesB.length && linesA[iA] === linesB[iB + look]) {
          matchB = iB + look;
          break;
        }
        if (iA + look < linesA.length && linesA[iA + look] === linesB[iB]) {
          matchA = iA + look;
          break;
        }
      }

      if (matchB !== -1) {
        while (iB < matchB) {
          console.log(`+ [L${iB+1}] ${linesB[iB]}`);
          iB++;
        }
      } else if (matchA !== -1) {
        while (iA < matchA) {
          console.log(`- [L${iA+1}] ${linesA[iA]}`);
          iA++;
        }
      } else {
        if (iA < linesA.length) {
          console.log(`- [L${iA+1}] ${linesA[iA]}`);
          iA++;
        }
        if (iB < linesB.length) {
          console.log(`+ [L${iB+1}] ${linesB[iB]}`);
          iB++;
        }
      }
    }
  }
}

simpleLineDiff("create_or_validate_booking (056 vs 061)", fn056_create, fn061_create);
simpleLineDiff("confirm_booking_payment (057 vs 061)", fn057_confirm, fn061_confirm);
simpleLineDiff("create_booking_balance_payment_order (021 vs 061)", fn021_bal, fn061_bal);
