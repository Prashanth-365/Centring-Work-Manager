# FinSight → Construction Manager Sync Prompt

Paste everything below (between **PROMPT START** and **PROMPT END**) to the AI that built this construction-manager app.

---

**PROMPT START**

I'm building a building-construction manager app. It needs to sync payment transactions whose category is **"Construction"** from a JSON file exported by another app called **FinSight** (a personal-finance PWA). My sync currently finds zero Construction transactions. Below is the **authoritative** structure of the FinSight export file (traced from its actual source code). Please fix my sync/parsing logic to match this structure.

## Export file: top-level shape

The file is produced by FinSight's `dumpAll()`. Every table is an array nested under a `data` key:

```json
{
  "version": 1,
  "exportedAt": 1718900000000,
  "data": {
	"users": [],
	"profiles": [],
	"accounts": [],
	"categories": [],
	"transactions": [],
	"investments": [],
	"chitFunds": [],
	"smsQueue": [],
	"statements": [],
	"settings": []
  }
}
```

My app only needs `data.transactions` and `data.categories`.

## CRITICAL: why my sync is failing

**Transactions do NOT contain the category name.** They store only a numeric `categoryId` (and `subCategoryId`). The string `"Construction"` exists **only** in the `categories` table. Any filter like `txn.category === "Construction"` will always return nothing. I must **join** transactions to categories by id.

## Transaction object shape (`data.transactions[]`)

```json
{
  "id": 42,
  "slNo": 42,
  "dateTime": 1718900000000,
  "profileId": 1,
  "accountId": 3,
  "categoryId": 21,
  "subCategoryId": 25,
  "amount": 15000,
  "txnType": "debit",
  "paymentMode": "bank",
  "description": "Cement purchase",
  "tags": ["site-a"],
  "source": "manual",
  "investmentId": null,
  "importFingerprint": "..."
}
```

Rules that matter for parsing:
- **`amount` is ALWAYS a positive number.** Direction lives in **`txnType`**: `"debit"` = money out, `"credit"` = money in. There are no negative amounts.
- **`dateTime` is epoch milliseconds (a number)**, not an ISO string. Convert with `new Date(dateTime)`.
- **`categoryId` and `subCategoryId` are numeric ids** into `categories`. A txn filed directly under the top-level "Construction" category has `subCategoryId: null`. A txn filed under a child of Construction has `categoryId` = Construction's id AND `subCategoryId` = the child's id.
- Currency is INR (₹).

## Category object shape (`data.categories[]`)

```json
{ "id": 21, "name": "Construction", "parentId": null, "icon": "🏗️", "color": "#...", "type": "expense" }
```

- Top-level categories have `parentId: null`.
- Sub-categories point to their parent: `{ "id": 25, "name": "Cement", "parentId": 21, ... }`.
- **"Construction" is a user-created category, not a built-in one** — so match it by name dynamically, never hard-code its id.

## Required sync logic (please implement equivalently)

```javascript
function getConstructionTxns(backup) {
  const { categories, transactions } = backup.data;

  // 1. Find the top-level "Construction" category (case-insensitive).
  const construction = categories.find(
	c => c.parentId == null && c.name.trim().toLowerCase() === 'construction'
  );
  if (!construction) return [];

  // 2. Collect Construction's id + all of its sub-category ids.
  const ids = new Set([construction.id]);
  for (const c of categories) if (c.parentId === construction.id) ids.add(c.id);

  // 3. A txn belongs to Construction if its categoryId OR subCategoryId is in that set.
  const byId = new Map(categories.map(c => [c.id, c]));
  return transactions
	.filter(t => ids.has(t.categoryId) || ids.has(t.subCategoryId))
	.map(t => ({
	  ...t,
	  categoryName:    byId.get(t.categoryId)?.name ?? null,
	  subCategoryName: byId.get(t.subCategoryId)?.name ?? null,
	  date:            new Date(t.dateTime),                       // ms → Date
	  signedAmount:    t.txnType === 'credit' ? t.amount : -t.amount
	}));
}
```

## Checklist to verify the fix

1. Read from `backup.data.transactions` (nested), not a top-level `transactions`.
2. Match the category via the **`categories` join by id**, not by any string on the transaction.
3. Include **sub-category** matches (`subCategoryId`), not just `categoryId`.
4. Treat `dateTime` as a **number in milliseconds**, and `amount` as **always positive** with `txnType` giving direction.
5. If the file has multiple `profiles`, decide whether to filter by a specific `profileId`.

Please update my import/sync code accordingly and show me the changed function(s).

**PROMPT END**
