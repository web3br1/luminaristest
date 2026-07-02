#!/bin/bash
# FE-INCR-1 Functional Validation via API
# Run this to test accounting backend without UI

set -e

BASE_URL="http://localhost:3001"
API_VERSION="v1"

echo "==================================="
echo "FE-INCR-1 Accounting API Validation"
echo "==================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass_count=0
fail_count=0

# Helper function
test_api() {
  local name="$1"
  local method="$2"
  local endpoint="$3"
  local expected_code="$4"
  local data="$5"

  echo -n "Testing: $name... "

  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
      -H "Content-Type: application/json" \
      -d "$data")
  fi

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)

  if [ "$http_code" = "$expected_code" ]; then
    echo -e "${GREEN}PASS${NC} (HTTP $http_code)"
    ((pass_count++))
    echo "$body" | head -3
  else
    echo -e "${RED}FAIL${NC} (expected $expected_code, got $http_code)"
    ((fail_count++))
    echo "$body" | head -3
  fi
  echo ""
}

# Test 1: Backend health
echo "1. Health Check"
test_api "Backend health" "GET" "/health" "200"

# Test 2: Create Unit (if not exists)
echo "2. Unit Management"
test_api "Get units" "GET" "/api/$API_VERSION/units" "200"

# Test 3: Accounting Periods
echo "3. Accounting Periods"
test_api "List periods" "GET" "/api/$API_VERSION/accounting/periods" "200"

# Test 4: Chart of Accounts
echo "4. Chart of Accounts"
test_api "List accounts" "GET" "/api/$API_VERSION/accounting/accounts" "200"

# Test 5: Journal Entries
echo "5. Journal Entries"
test_api "List entries" "GET" "/api/$API_VERSION/accounting/entries" "200"

# Test 6: Ledger
echo "6. Ledger"
test_api "Get ledger" "GET" "/api/$API_VERSION/accounting/ledger?accountId=1000" "200"

# Test 7: Trial Balance
echo "7. Trial Balance"
test_api "Get trial balance" "GET" "/api/$API_VERSION/accounting/trial-balance" "200"

# Test 8: Balance Sheet
echo "8. Balance Sheet"
test_api "Get balance sheet" "GET" "/api/$API_VERSION/accounting/balance-sheet" "200"

# Test 9: Income Statement
echo "9. Income Statement"
test_api "Get income statement" "GET" "/api/$API_VERSION/accounting/income-statement" "200"

echo ""
echo "==================================="
echo -e "Results: ${GREEN}$pass_count PASS${NC} / ${RED}$fail_count FAIL${NC}"
echo "==================================="

if [ $fail_count -eq 0 ]; then
  echo -e "${GREEN}✓ All API endpoints accessible${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Start servers: npm run dev (both server/ and my-app/)"
  echo "2. Open http://localhost:3000 in browser"
  echo "3. Follow FE-INCR1-FUNCTIONAL-VALIDATION-GUIDE.md for manual UI validation"
  exit 0
else
  echo -e "${RED}✗ Some endpoints failed${NC}"
  exit 1
fi
