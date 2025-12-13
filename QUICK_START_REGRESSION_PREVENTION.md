# Quick Start: Regression Prevention (30 Minutes)

**Goal:** Stop breaking things that work. Start protecting your progress TODAY.

---

## Step 1: Run Smoke Tests (5 minutes)

### First, establish your baseline:

```bash
cd backend

# Reset MetaSteel to known good state
npm run reset:metasteel

# Run the new smoke tests
npm run test:smoke
```

**Expected Result:**
```
PASS src/__tests__/smoke/critical-flows.test.js
  🔥 CRITICAL SMOKE TESTS - SmartMetal Core Flows
    ✅ Flow 1: Dashboard Load
      ✓ Dashboard query returns summary data without errors
      ✓ Tenant is properly configured
    ✅ Flow 2: RFQ List & Detail
      ✓ RFQs query returns tenant-scoped data without errors
      ✓ RFQ detail query with line items works
      ✓ No cross-tenant data leakage in RFQs
    ✅ Flow 3: Pricing Runs View
      ✓ Pricing runs query returns tenant-scoped data
      ✓ Pricing run detail with line items works
    ✅ Flow 4: Approvals Queue
      ✓ Approvals query returns tenant-scoped data
      ✓ Approval status transitions are valid
    ✅ Flow 5: Materials Catalog
      ✓ Materials query returns tenant-scoped data
      ✓ No duplicate materials per tenant
      ✓ Materials tenant_id is NOT NULL
      ✓ No cross-tenant access to materials
    ✅ Flow 6: Price Agreements
      ✓ Price agreements query returns tenant-scoped data
      ✓ Price agreement status values are valid
      ✓ No cross-tenant data leakage in price agreements
    ✅ Integrity: Foreign Keys & Relationships
      ✓ No orphaned RFQ items
      ✓ No orphaned pricing run items
      ✓ All pricing runs have valid rfq_id

Test Suites: 1 passed, 1 total
Tests:       20 passed, 20 total
Time:        3.456 s
```

### If tests FAIL:
1. **Don't panic** - you found issues BEFORE they became production bugs
2. Check the error message carefully
3. Common fixes:
   - `Tenant METASTEEL not found` → Run `npm run reset:metasteel`
   - `No RFQs found` → Run `npm run reset:metasteel`
   - Database connection errors → Check `.env` file

---

## Step 2: Install Pre-Commit Hooks (10 minutes)

### Automatically run smoke tests before every commit:

```bash
cd backend

# Install Husky (Git hooks manager)
npm install --save-dev husky

# Initialize Husky
npx husky install

# Create pre-commit hook
npx husky add .husky/pre-commit "cd backend && npm run test:smoke"

# Make hook executable (Linux/Mac)
chmod +x .husky/pre-commit
```

**What this does:**
- Every time you run `git commit`, smoke tests run automatically
- If tests fail, commit is blocked
- Forces you to fix regressions immediately

### Test it works:

```bash
# Try to commit something
git add .
git commit -m "test commit"

# You should see:
# Running smoke tests...
# PASS src/__tests__/smoke/critical-flows.test.js
# ✅ All smoke tests passed - commit allowed
```

---

## Step 3: Create Baseline Document (5 minutes)

### Capture your current "known good state":

```bash
cd backend

# Run full verification
npm run verify:all > ../docs/BASELINE_STATE_$(date +%Y-%m-%d).md 2>&1

# Or on Windows PowerShell:
npm run verify:all > ..\docs\BASELINE_STATE_$(Get-Date -Format "yyyy-MM-dd").md 2>&1
```

**What this does:**
- Documents what's working RIGHT NOW
- Gives you a reference point to compare against
- Helps identify when things break (compare before/after)

---

## Step 4: Adopt the Workflow (10 minutes)

### New Development Workflow (use this going forward):

#### Before You Start Coding:
```bash
cd backend
npm run test:smoke  # Verify system is healthy
```

#### While You're Coding:
- Make small changes
- Run `npm run test:smoke` every 30 minutes
- Commit frequently with working code

#### Before You Commit:
```bash
npm run test:smoke  # Auto-runs via pre-commit hook anyway
```

#### Before You Push:
```bash
npm run verify:all  # Full verification (smoke tests + health check)
```

---

## Step 5: Print This Checklist (Keep It Visible)

### 📋 Daily Workflow Checklist

```
Morning:
[ ] Run: npm run test:smoke
[ ] Verify: All 20 tests pass
[ ] Note: System is healthy, ready to work

Before ANY Code Change:
[ ] Ask: What could this break?
[ ] Check: What tests cover this?
[ ] Run: npm run test:smoke (baseline)

While Coding:
[ ] Commit: Small, working changes
[ ] Test: Run npm run test:smoke every 30 min
[ ] Fix: Regressions immediately (don't accumulate)

Before Committing:
[ ] Run: npm run test:smoke (auto-runs via hook)
[ ] Verify: All tests still pass
[ ] Fix: Any new failures before commit

Before Pushing:
[ ] Run: npm run verify:all
[ ] Verify: MetaSteel demo still works
[ ] Push: Only if everything passes

End of Day:
[ ] Run: npm run test:smoke
[ ] Commit: All working code
[ ] Document: Any issues for tomorrow
```

---

## Common Scenarios & Solutions

### Scenario 1: "I changed something and tests are failing"

**Solution:**
```bash
# 1. Read the error message
npm run test:smoke --verbose

# 2. Common issues:
# - Tenant data missing → npm run reset:metasteel
# - Schema changed → Check if migration broke something
# - Query syntax error → Check your SQL changes

# 3. Fix the issue
# (edit code)

# 4. Re-run tests
npm run test:smoke

# 5. Commit when passing
git commit -m "Fix: [description]"
```

### Scenario 2: "Tests pass but UI is broken"

**Solution:**
Tests only check backend API. You still need to:
1. Test the UI manually (5-minute smoke test from checklist)
2. Add frontend tests (future work)
3. Run full MetaSteel demo verification: `npm run verify:metasteel:health`

### Scenario 3: "Tests are too slow"

**Current:** ~3-5 seconds (very fast)
**If it gets slower:**
- Use smaller test dataset
- Mock external services
- Run in parallel

### Scenario 4: "I need to make a breaking change"

**Solution:**
1. Update the smoke tests FIRST
2. Document the breaking change
3. Update baseline state
4. Commit tests + code together
5. Notify team of breaking change

### Scenario 5: "Someone else broke the tests"

**Solution:**
```bash
# 1. Pull their changes
git pull origin main

# 2. Run smoke tests
npm run test:smoke

# 3. If failing, notify them immediately
# (send them the error output)

# 4. If urgent, revert their commit
git revert <commit-hash>
npm run test:smoke  # Verify tests pass again
git push origin main
```

---

## What You've Accomplished

After completing these 5 steps, you now have:

✅ **Automated smoke tests** that verify critical functionality
✅ **Pre-commit hooks** that prevent broken commits
✅ **Baseline documentation** showing current working state
✅ **Clear workflow** to prevent regressions
✅ **Quick reference** for common scenarios

**Time invested:** 30 minutes
**Time saved per week:** 4-8 hours (no more fix/break cycles)

---

## Next Steps (Optional - Do Later)

### Week 1:
- [ ] Fix any failing unit tests (triageexisting 71 failures)
- [ ] Add test coverage for materials service
- [ ] Document any "known breaking changes"

### Week 2:
- [ ] Add frontend smoke tests (Playwright/Cypress)
- [ ] Set up CI/CD to run tests automatically
- [ ] Create git aliases for safe-commit/safe-push

### Month 1:
- [ ] Increase test coverage to >50% on critical services
- [ ] Create visual regression tests (screenshot comparison)
- [ ] Build automated deployment pipeline

---

## Success Metrics

### How to Know It's Working:

**Week 1:**
- Zero "accidental" regressions
- Commits always have passing tests
- Confidence to make changes without fear

**Week 2:**
- No wasted time debugging old bugs
- Faster development (less time testing manually)
- Fewer "I broke it again" incidents

**Month 1:**
- Test coverage increasing
- Development speed increasing
- Production deployments more confident

---

## Help & Troubleshooting

### Commands Reference:

```bash
# Run smoke tests only (fast)
npm run test:smoke

# Run all verification
npm run verify:all

# Reset MetaSteel demo data
npm run reset:metasteel

# Check MetaSteel health
npm run verify:metasteel:health

# Run full test suite (slow)
npm test

# Run tests in watch mode (during development)
npm run test:watch
```

### Files Reference:

- **Smoke tests:** `backend/src/__tests__/smoke/critical-flows.test.js`
- **Strategy doc:** `REGRESSION_PREVENTION_STRATEGY.md`
- **Smoke test checklist:** `docs/METASTEEL_SMOKE_TEST_CHECKLIST.md`
- **Pre-commit hook:** `.husky/pre-commit`

### Getting Help:

1. Check error message carefully
2. Read `REGRESSION_PREVENTION_STRATEGY.md`
3. Check baseline state document
4. Ask team if issue persists

---

## Print-Friendly One-Pager

```
╔════════════════════════════════════════════════════════════╗
║       REGRESSION PREVENTION - ONE RULE TO REMEMBER        ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  Never commit code that breaks the smoke tests.            ║
║                                                            ║
║  Commands:                                                 ║
║  - npm run test:smoke      → Run before every commit       ║
║  - npm run verify:all      → Run before every push         ║
║  - npm run reset:metasteel → Fix broken test data          ║
║                                                            ║
║  Workflow:                                                 ║
║  1. Run test:smoke (baseline)                              ║
║  2. Make changes                                           ║
║  3. Run test:smoke (verify)                                ║
║  4. Commit (auto-runs smoke tests via hook)                ║
║  5. Push (after verify:all passes)                         ║
║                                                            ║
║  If Tests Fail:                                            ║
║  ❌ Do NOT commit                                          ║
║  ❌ Do NOT push                                            ║
║  ❌ Do NOT "fix it later"                                  ║
║  ✅ Fix immediately                                        ║
║  ✅ Re-run tests                                           ║
║  ✅ Commit when passing                                    ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

---

**Last Updated:** 2025-12-13
**Next Review:** After 1 week of use
