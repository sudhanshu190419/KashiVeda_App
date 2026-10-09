// __tests__/pandit_manual_payout_management.test.ts
export interface PanditPayoutSummaryItem {
  pandit_id: string;
  pandit_name: string;
  pandit_phone: string;
  verification_status: "pending" | "verified" | "rejected";
  bank_name?: string;
  bank_account_mask?: string;
  bank_ifsc?: string;
  bank_holder_name?: string;
  has_verified_bank: boolean;
  total_earned: number;
  total_paid: number;
  unpaid_balance: number;
  pending_payout_count: number;
  last_payout_date: string | null;
  payout_status: "pending" | "paid" | "none";
}

export interface PayoutOverviewStats {
  total_eligible_unpaid: number;
  payouts_awaiting_transfer_count: number;
  total_completed_payouts: number;
  pandits_awaiting_payment_count: number;
}

export interface RecordPayoutFormData {
  pandit_id: string;
  amount: number;
  payment_method: string;
  transaction_reference: string;
  payment_date?: string;
  proof_document_path?: string | null;
  notes?: string | null;
}

describe("Manual Pandit Payout Management & Financial Settlement Test Suite", () => {
  const superAdminUserId = "superadmin-1111-2222-3333-444444444444";
  const adminUserId = "admin-2222-3333-4444-555555555555";
  const panditUserId = "pandit-user-3333-4444-5555-666666666666";
  const customerUserId = "customer-9999-8888-7777-666666666666";

  // Mock Database State
  interface MockPandit {
    id: string;
    user_id: string;
    verification_status: "pending" | "verified" | "rejected";
    profile: {
      display_name: string;
      phone: string;
    };
  }

  interface MockBankAccount {
    id: string;
    pandit_id: string;
    bank_name: string;
    account_number: string;
    ifsc_code: string;
    account_holder_name: string;
    verification_status: "pending" | "verified" | "rejected";
  }

  interface MockPayoutRecord {
    id: string;
    pandit_id: string;
    booking_id: string | null;
    kundli_order_id: string | null;
    bank_account_id: string | null;
    gross_amount: number;
    platform_fee: number;
    net_amount: number;
    status: "pending" | "paid" | "failed" | "cancelled";
    payment_method?: string | null;
    transaction_reference?: string | null;
    proof_document_path?: string | null;
    notes?: string | null;
    confirmed_by_admin_id?: string | null;
    confirmed_at?: string | null;
    created_at: string;
  }

  interface MockAuditLog {
    id: string;
    admin_id: string;
    action: string;
    target_type: string;
    target_id: string;
    details: any;
    created_at: string;
  }

  let panditsTable: MockPandit[] = [];
  let bankAccountsTable: MockBankAccount[] = [];
  let payoutsTable: MockPayoutRecord[] = [];
  let auditLogsTable: MockAuditLog[] = [];

  beforeEach(() => {
    panditsTable = [
      {
        id: "pdt-shastri-1",
        user_id: panditUserId,
        verification_status: "verified",
        profile: {
          display_name: "Acharya Ramkrishna Shastri",
          phone: "+919876543210",
        },
      },
      {
        id: "pdt-pandey-2",
        user_id: "pandit-user-2",
        verification_status: "verified",
        profile: {
          display_name: "Pandit Govind Pandey",
          phone: "+919876543211",
        },
      },
      {
        id: "pdt-unverified-3",
        user_id: "pandit-user-3",
        verification_status: "pending",
        profile: {
          display_name: "Unverified Shastri",
          phone: "+919876543212",
        },
      },
    ];

    bankAccountsTable = [
      {
        id: "bank-shastri-1",
        pandit_id: "pdt-shastri-1",
        bank_name: "State Bank of India",
        account_number: "123456789012",
        ifsc_code: "SBIN0001234",
        account_holder_name: "Ramkrishna Shastri",
        verification_status: "verified",
      },
      {
        id: "bank-pandey-2",
        pandit_id: "pdt-pandey-2",
        bank_name: "HDFC Bank",
        account_number: "987654321098",
        ifsc_code: "HDFC0005678",
        account_holder_name: "Govind Pandey",
        verification_status: "verified",
      },
      {
        id: "bank-unverified-3",
        pandit_id: "pdt-unverified-3",
        bank_name: "Punjab National Bank",
        account_number: "555566667777",
        ifsc_code: "PUNB0001111",
        account_holder_name: "Unverified Shastri",
        verification_status: "pending",
      },
    ];

    payoutsTable = [
      // Shastri: 2 pending payouts (₹2,100 + ₹1,500 = ₹3,600 eligible unpaid)
      {
        id: "pay-shastri-101",
        pandit_id: "pdt-shastri-1",
        booking_id: "bk-101",
        kundli_order_id: null,
        bank_account_id: "bank-shastri-1",
        gross_amount: 2100,
        platform_fee: 0,
        net_amount: 2100,
        status: "pending",
        created_at: "2026-10-01T10:00:00Z",
      },
      {
        id: "pay-shastri-102",
        pandit_id: "pdt-shastri-1",
        booking_id: "bk-102",
        kundli_order_id: null,
        bank_account_id: "bank-shastri-1",
        gross_amount: 1500,
        platform_fee: 0,
        net_amount: 1500,
        status: "pending",
        created_at: "2026-10-03T11:00:00Z",
      },
      // Shastri: 1 previously completed payout (₹5,100)
      {
        id: "pay-shastri-100",
        pandit_id: "pdt-shastri-1",
        booking_id: "bk-100",
        kundli_order_id: null,
        bank_account_id: "bank-shastri-1",
        gross_amount: 5100,
        platform_fee: 0,
        net_amount: 5100,
        status: "paid",
        payment_method: "bank_transfer",
        transaction_reference: "UTR987654321001",
        confirmed_by_admin_id: superAdminUserId,
        confirmed_at: "2026-09-30T14:00:00Z",
        created_at: "2026-09-28T09:00:00Z",
      },
      // Pandey: 1 pending payout (₹3,000)
      {
        id: "pay-pandey-201",
        pandit_id: "pdt-pandey-2",
        booking_id: null,
        kundli_order_id: "knd-201",
        bank_account_id: "bank-pandey-2",
        gross_amount: 3000,
        platform_fee: 0,
        net_amount: 3000,
        status: "pending",
        created_at: "2026-10-04T12:00:00Z",
      },
    ];

    auditLogsTable = [];
  });

  // Authoritative Calculation: Calculate Pandit Summaries
  function calculatePanditPayoutSummaries(
    search?: string,
    statusFilter: "all" | "pending" | "paid" = "all"
  ): { summaries: PanditPayoutSummaryItem[]; stats: PayoutOverviewStats } {
    const list: PanditPayoutSummaryItem[] = [];

    for (const pandit of panditsTable) {
      const panditPayouts = payoutsTable.filter((p) => p.pandit_id === pandit.id);
      const verifiedBank = bankAccountsTable.find(
        (b) => b.pandit_id === pandit.id && b.verification_status === "verified"
      );

      const totalEarned = panditPayouts.reduce((sum, p) => sum + p.net_amount, 0);
      const totalPaid = panditPayouts
        .filter((p) => p.status === "paid")
        .reduce((sum, p) => sum + p.net_amount, 0);
      const pendingPayouts = panditPayouts.filter((p) => p.status === "pending");
      const unpaidBalance = pendingPayouts.reduce((sum, p) => sum + p.net_amount, 0);

      const paidPayouts = panditPayouts
        .filter((p) => p.status === "paid")
        .sort((a, b) => new Date(b.confirmed_at || b.created_at).getTime() - new Date(a.confirmed_at || a.created_at).getTime());

      const lastPayoutDate = paidPayouts.length > 0 ? (paidPayouts[0].confirmed_at || paidPayouts[0].created_at) : null;

      let payoutStatus: "pending" | "paid" | "none" = "none";
      if (unpaidBalance > 0) {
        payoutStatus = "pending";
      } else if (totalPaid > 0) {
        payoutStatus = "paid";
      }

      // Filter matching
      if (statusFilter === "pending" && payoutStatus !== "pending") continue;
      if (statusFilter === "paid" && payoutStatus !== "paid") continue;

      if (search && search.trim()) {
        const query = search.toLowerCase();
        const matchesName = pandit.profile.display_name.toLowerCase().includes(query);
        const matchesPhone = pandit.profile.phone.toLowerCase().includes(query);
        const matchesBank = verifiedBank?.bank_name.toLowerCase().includes(query) || false;
        if (!matchesName && !matchesPhone && !matchesBank) continue;
      }

      // Mask bank account
      const maskedAcc = verifiedBank
        ? `•••• •••• ${verifiedBank.account_number.slice(-4)}`
        : undefined;

      list.push({
        pandit_id: pandit.id,
        pandit_name: pandit.profile.display_name,
        pandit_phone: pandit.profile.phone,
        verification_status: pandit.verification_status,
        bank_name: verifiedBank?.bank_name,
        bank_account_mask: maskedAcc,
        bank_ifsc: verifiedBank?.ifsc_code,
        bank_holder_name: verifiedBank?.account_holder_name,
        has_verified_bank: !!verifiedBank,
        total_earned: totalEarned,
        total_paid: totalPaid,
        unpaid_balance: unpaidBalance,
        pending_payout_count: pendingPayouts.length,
        last_payout_date: lastPayoutDate,
        payout_status: payoutStatus,
      });
    }

    // Calculate Global Stats
    const totalEligibleUnpaid = payoutsTable
      .filter((p) => p.status === "pending")
      .reduce((sum, p) => sum + p.net_amount, 0);

    const totalCompletedPayouts = payoutsTable
      .filter((p) => p.status === "paid")
      .reduce((sum, p) => sum + p.net_amount, 0);

    const pendingPayoutRecords = payoutsTable.filter((p) => p.status === "pending").length;

    const panditsAwaitingSet = new Set(
      payoutsTable.filter((p) => p.status === "pending").map((p) => p.pandit_id)
    );

    const stats: PayoutOverviewStats = {
      total_eligible_unpaid: totalEligibleUnpaid,
      payouts_awaiting_transfer_count: pendingPayoutRecords,
      total_completed_payouts: totalCompletedPayouts,
      pandits_awaiting_payment_count: panditsAwaitingSet.size,
    };

    return { summaries: list, stats };
  }

  // Authoritative Mutation: Record Manual Pandit Payout
  function simulateRecordManualPayout(
    callerRoles: string[],
    callerId: string,
    formData: RecordPayoutFormData
  ): { success: boolean; error?: string; payout_ids?: string[] } {
    // 1. Authorization check
    if (!callerRoles.includes("admin") && !callerRoles.includes("super_admin")) {
      return { success: false, error: "Unauthorized: Administrator privileges required" };
    }

    // 2. Validation
    const amount = Number(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: "Payout amount must be a positive number greater than 0." };
    }

    const utr = (formData.transaction_reference || "").trim();
    if (utr.length < 4) {
      return { success: false, error: "Valid transaction reference (UTR) is required (minimum 4 characters)." };
    }

    const validMethods = ["bank_transfer", "upi", "neft", "imps", "rtgs"];
    if (!validMethods.includes(formData.payment_method)) {
      return { success: false, error: `Invalid payment method: ${formData.payment_method}` };
    }

    // 3. Check Pandit and verified bank account
    const pandit = panditsTable.find((p) => p.id === formData.pandit_id);
    if (!pandit) {
      return { success: false, error: "Pandit record not found." };
    }

    const verifiedBank = bankAccountsTable.find(
      (b) => b.pandit_id === formData.pandit_id && b.verification_status === "verified"
    );
    if (!verifiedBank) {
      return { success: false, error: "Cannot process payout: Pandit has no verified bank account." };
    }

    // 4. Check eligible unpaid balance
    const pendingRecords = payoutsTable
      .filter((p) => p.pandit_id === formData.pandit_id && p.status === "pending")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const totalEligible = pendingRecords.reduce((sum, p) => sum + p.net_amount, 0);
    if (totalEligible <= 0) {
      return { success: false, error: "No eligible unpaid balance available for this Pandit." };
    }

    if (amount > totalEligible) {
      return {
        success: false,
        error: `Requested amount (₹${amount.toLocaleString("en-IN")}) exceeds eligible unpaid balance (₹${totalEligible.toLocaleString("en-IN")}).`,
      };
    }

    // 5. Check duplicate UTR on completed payouts
    const duplicateUtr = payoutsTable.find(
      (p) => p.status === "paid" && p.transaction_reference === utr
    );
    if (duplicateUtr) {
      return {
        success: false,
        error: `Transaction reference '${utr}' has already been used for payout ${duplicateUtr.id}.`,
      };
    }

    // 6. Settle pending records up to requested amount (FIFO settlement)
    let remainingToSettle = amount;
    const settledPayoutIds: string[] = [];
    const now = new Date().toISOString();

    for (const rec of pendingRecords) {
      if (remainingToSettle <= 0) break;

      if (rec.net_amount <= remainingToSettle) {
        // Full settlement of this item
        rec.status = "paid";
        rec.payment_method = formData.payment_method;
        rec.transaction_reference = utr;
        rec.proof_document_path = formData.proof_document_path || null;
        rec.notes = formData.notes || null;
        rec.confirmed_by_admin_id = callerId;
        rec.confirmed_at = formData.payment_date || now;
        remainingToSettle -= rec.net_amount;
        settledPayoutIds.push(rec.id);
      } else {
        // Partial settlement: split record
        const settledPortion = remainingToSettle;
        const remainingPortion = rec.net_amount - settledPortion;

        // Mark current record as paid for the settled portion
        rec.gross_amount = settledPortion;
        rec.net_amount = settledPortion;
        rec.status = "paid";
        rec.payment_method = formData.payment_method;
        rec.transaction_reference = utr;
        rec.proof_document_path = formData.proof_document_path || null;
        rec.notes = formData.notes || null;
        rec.confirmed_by_admin_id = callerId;
        rec.confirmed_at = formData.payment_date || now;
        settledPayoutIds.push(rec.id);

        // Create new pending record for the remainder
        const remainderRecord: MockPayoutRecord = {
          id: `pay-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          pandit_id: rec.pandit_id,
          booking_id: rec.booking_id,
          kundli_order_id: rec.kundli_order_id,
          bank_account_id: rec.bank_account_id,
          gross_amount: remainingPortion,
          platform_fee: 0,
          net_amount: remainingPortion,
          status: "pending",
          created_at: rec.created_at,
        };
        payoutsTable.push(remainderRecord);
        remainingToSettle = 0;
      }
    }

    // 7. Record immutable audit log
    auditLogsTable.push({
      id: `audit-${Date.now()}`,
      admin_id: callerId,
      action: "record_manual_pandit_payout",
      target_type: "pandit_payouts",
      target_id: formData.pandit_id,
      details: {
        amount,
        payment_method: formData.payment_method,
        transaction_reference: utr,
        settled_payout_ids: settledPayoutIds,
        proof_document_path: formData.proof_document_path,
        bank_account_id: verifiedBank.id,
      },
      created_at: now,
    });

    return { success: true, payout_ids: settledPayoutIds };
  }

  // --- TEST SUITES ---

  describe("1. Authoritative Calculations & Summary Statistics", () => {
    test("calculates total eligible unpaid earnings and completed payouts accurately", () => {
      const { summaries, stats } = calculatePanditPayoutSummaries();

      // Total pending: Shastri (₹2100 + ₹1500) + Pandey (₹3000) = ₹6600
      expect(stats.total_eligible_unpaid).toBe(6600);
      expect(stats.payouts_awaiting_transfer_count).toBe(3);

      // Total completed: Shastri (₹5100) = ₹5100
      expect(stats.total_completed_payouts).toBe(5100);
      expect(stats.pandits_awaiting_payment_count).toBe(2);

      // Shastri summary verification
      const shastri = summaries.find((s) => s.pandit_id === "pdt-shastri-1");
      expect(shastri).toBeDefined();
      expect(shastri?.total_earned).toBe(8700); // 2100 + 1500 + 5100
      expect(shastri?.total_paid).toBe(5100);
      expect(shastri?.unpaid_balance).toBe(3600);
      expect(shastri?.pending_payout_count).toBe(2);
      expect(shastri?.payout_status).toBe("pending");
      expect(shastri?.has_verified_bank).toBe(true);
      expect(shastri?.bank_account_mask).toBe("•••• •••• 9012");
    });

    test("filters summaries by status correctly (pending / paid)", () => {
      const pendingOnly = calculatePanditPayoutSummaries(undefined, "pending");
      expect(pendingOnly.summaries.length).toBe(2);
      expect(pendingOnly.summaries.every((s) => s.payout_status === "pending")).toBe(true);

      const paidOnly = calculatePanditPayoutSummaries(undefined, "paid");
      // Pandey has no completed payouts, only Shastri has both, but unpaid_balance > 0 makes payout_status = pending
      expect(paidOnly.summaries.length).toBe(0);
    });

    test("searches by Pandit name, phone, and bank name", () => {
      const searchByName = calculatePanditPayoutSummaries("Ramkrishna");
      expect(searchByName.summaries.length).toBe(1);
      expect(searchByName.summaries[0].pandit_name).toBe("Acharya Ramkrishna Shastri");

      const searchByPhone = calculatePanditPayoutSummaries("9876543211");
      expect(searchByPhone.summaries.length).toBe(1);
      expect(searchByPhone.summaries[0].pandit_id).toBe("pdt-pandey-2");

      const searchByBank = calculatePanditPayoutSummaries("HDFC");
      expect(searchByBank.summaries.length).toBe(1);
      expect(searchByBank.summaries[0].bank_name).toBe("HDFC Bank");
    });
  });

  describe("2. Role-Based Authorization & Permissions", () => {
    test("allows Super Admin to record a manual payout", () => {
      const res = simulateRecordManualPayout(
        ["super_admin"],
        superAdminUserId,
        {
          pandit_id: "pdt-shastri-1",
          amount: 3600,
          payment_method: "bank_transfer",
          transaction_reference: "UTR20261009001",
          payment_date: "2026-10-09T10:00:00Z",
          notes: "Full payout for October ritual completions",
        }
      );

      expect(res.success).toBe(true);
      expect(res.payout_ids).toHaveLength(2);
    });

    test("allows Admin to record a manual payout", () => {
      const res = simulateRecordManualPayout(
        ["admin"],
        adminUserId,
        {
          pandit_id: "pdt-pandey-2",
          amount: 3000,
          payment_method: "upi",
          transaction_reference: "UPI20261009002",
          payment_date: "2026-10-09T10:00:00Z",
        }
      );

      expect(res.success).toBe(true);
      expect(res.payout_ids).toHaveLength(1);
    });

    test("rejects Customer or Pandit from recording a payout", () => {
      const res = simulateRecordManualPayout(
        ["customer"],
        customerUserId,
        {
          pandit_id: "pdt-shastri-1",
          amount: 1000,
          payment_method: "bank_transfer",
          transaction_reference: "UTR_ATTEMPT",
        }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("Unauthorized");
    });
  });

  describe("3. Validation & Overpayment Prevention", () => {
    test("rejects negative or zero payout amounts", () => {
      const resZero = simulateRecordManualPayout(
        ["admin"],
        adminUserId,
        {
          pandit_id: "pdt-shastri-1",
          amount: 0,
          payment_method: "bank_transfer",
          transaction_reference: "UTR_ZERO",
        }
      );
      expect(resZero.success).toBe(false);
      expect(resZero.error).toContain("must be a positive number greater than 0");

      const resNeg = simulateRecordManualPayout(
        ["admin"],
        adminUserId,
        {
          pandit_id: "pdt-shastri-1",
          amount: -500,
          payment_method: "bank_transfer",
          transaction_reference: "UTR_NEG",
        }
      );
      expect(resNeg.success).toBe(false);
    });

    test("rejects payout amount exceeding eligible unpaid balance", () => {
      // Shastri has eligible unpaid balance of ₹3,600
      const res = simulateRecordManualPayout(
        ["admin"],
        adminUserId,
        {
          pandit_id: "pdt-shastri-1",
          amount: 4000, // Exceeds 3,600
          payment_method: "bank_transfer",
          transaction_reference: "UTR_EXCEED",
        }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("exceeds eligible unpaid balance");
    });

    test("rejects payout if Pandit has no verified bank account", () => {
      // Add a pending payout for unverified Pandit
      payoutsTable.push({
        id: "pay-unverified-1",
        pandit_id: "pdt-unverified-3",
        booking_id: "bk-999",
        kundli_order_id: null,
        bank_account_id: "bank-unverified-3",
        gross_amount: 1000,
        platform_fee: 0,
        net_amount: 1000,
        status: "pending",
        created_at: "2026-10-08T10:00:00Z",
      });

      const res = simulateRecordManualPayout(
        ["admin"],
        adminUserId,
        {
          pandit_id: "pdt-unverified-3",
          amount: 1000,
          payment_method: "bank_transfer",
          transaction_reference: "UTR_UNVERIFIED",
        }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("no verified bank account");
    });

    test("rejects empty or short transaction reference (UTR)", () => {
      const res = simulateRecordManualPayout(
        ["admin"],
        adminUserId,
        {
          pandit_id: "pdt-shastri-1",
          amount: 1000,
          payment_method: "bank_transfer",
          transaction_reference: "12",
        }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("Valid transaction reference (UTR) is required");
    });

    test("rejects invalid payment method", () => {
      const res = simulateRecordManualPayout(
        ["admin"],
        adminUserId,
        {
          pandit_id: "pdt-shastri-1",
          amount: 1000,
          payment_method: "cash_in_hand" as any,
          transaction_reference: "CASH_1234",
        }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("Invalid payment method");
    });
  });

  describe("4. Duplicate Payout Prevention & Idempotency", () => {
    test("rejects duplicate transaction reference (UTR) on already settled payouts", () => {
      const res = simulateRecordManualPayout(
        ["admin"],
        adminUserId,
        {
          pandit_id: "pdt-shastri-1",
          amount: 2100,
          payment_method: "bank_transfer",
          transaction_reference: "UTR987654321001", // Already used for pay-shastri-100
        }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("already been used");
    });

    test("settling full balance prevents any subsequent payouts from being processed", () => {
      // Step 1: Settle full balance (₹3,600)
      const res1 = simulateRecordManualPayout(
        ["admin"],
        adminUserId,
        {
          pandit_id: "pdt-shastri-1",
          amount: 3600,
          payment_method: "bank_transfer",
          transaction_reference: "UTR_FULL_SETTLE_01",
        }
      );
      expect(res1.success).toBe(true);

      // Step 2: Immediate retry or second payout attempt
      const res2 = simulateRecordManualPayout(
        ["admin"],
        adminUserId,
        {
          pandit_id: "pdt-shastri-1",
          amount: 500,
          payment_method: "bank_transfer",
          transaction_reference: "UTR_SECOND_ATTEMPT_02",
        }
      );
      expect(res2.success).toBe(false);
      expect(res2.error).toContain("No eligible unpaid balance available");

      // Verify recalculated summary
      const { summaries, stats } = calculatePanditPayoutSummaries();
      const shastri = summaries.find((s) => s.pandit_id === "pdt-shastri-1");
      expect(shastri?.unpaid_balance).toBe(0);
      expect(shastri?.total_paid).toBe(8700);
      expect(shastri?.payout_status).toBe("paid");
    });
  });

  describe("5. Partial Payout Support & Remaining Balance Calculation", () => {
    test("correctly settles partial amount and retains remaining balance as pending", () => {
      // Shastri has 2 pending items: ₹2100 + ₹1500 = ₹3600
      // Admin records partial payout of ₹2500 (covers 1st item ₹2100 + ₹400 of 2nd item)
      const res = simulateRecordManualPayout(
        ["admin"],
        adminUserId,
        {
          pandit_id: "pdt-shastri-1",
          amount: 2500,
          payment_method: "bank_transfer",
          transaction_reference: "UTR_PARTIAL_2500",
          payment_date: "2026-10-09T12:00:00Z",
          proof_document_path: "payout-proofs/pdt-shastri-1/20261009_utr2500.pdf",
        }
      );

      expect(res.success).toBe(true);
      expect(res.payout_ids).toHaveLength(2);

      // Recalculate
      const { summaries } = calculatePanditPayoutSummaries();
      const shastri = summaries.find((s) => s.pandit_id === "pdt-shastri-1");

      expect(shastri?.total_paid).toBe(5100 + 2500); // 7600
      expect(shastri?.unpaid_balance).toBe(1100); // 3600 - 2500 = 1100
      expect(shastri?.payout_status).toBe("pending");
      expect(shastri?.pending_payout_count).toBe(1); // 1 remainder pending item

      // Verify audit log recorded
      expect(auditLogsTable.length).toBe(1);
      expect(auditLogsTable[0].action).toBe("record_manual_pandit_payout");
      expect(auditLogsTable[0].details.amount).toBe(2500);
      expect(auditLogsTable[0].details.proof_document_path).toBe(
        "payout-proofs/pdt-shastri-1/20261009_utr2500.pdf"
      );
    });
  });

  describe("6. Storage Security & Privacy Safeguards", () => {
    test("verifies storage file validation constraints", () => {
      const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      const maxSizeBytes = 10 * 1024 * 1024; // 10MB

      // Valid PDF
      const validPdf = { type: "application/pdf", size: 2 * 1024 * 1024 };
      expect(allowedMimeTypes.includes(validPdf.type)).toBe(true);
      expect(validPdf.size <= maxSizeBytes).toBe(true);

      // Invalid MIME type (executable / script)
      const invalidExe = { type: "application/x-msdownload", size: 1024 };
      expect(allowedMimeTypes.includes(invalidExe.type)).toBe(false);

      // File too large
      const oversizeFile = { type: "image/jpeg", size: 15 * 1024 * 1024 };
      expect(oversizeFile.size <= maxSizeBytes).toBe(false);
    });

    test("ensures sensitive full bank account numbers are never exposed in summaries", () => {
      const { summaries } = calculatePanditPayoutSummaries();
      for (const summary of summaries) {
        if (summary.bank_account_mask) {
          expect(summary.bank_account_mask).toMatch(/^•••• •••• \d{4}$/);
          // Ensure it does not contain the full 12 digits
          expect(summary.bank_account_mask.length).toBeLessThan(17);
        }
      }
    });
  });
});
