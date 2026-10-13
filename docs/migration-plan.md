# Heisenberg Lab: Chemical Document ID Migration Plan (Dry-Run Only)

**Target Project:** `heisenberg-6d136`  
**Execution Status:** **DRY-RUN SPECIFICATION ONLY** (No live records written, renamed, or deleted).

---

## 1. Executive Summary & Objective

Transition existing legacy Firestore chemical document IDs (both prefixed `chem_*` and auto-generated alphanumeric IDs like `5byVyABoiYzUSldTT0CT`) to human-readable IDs matching chemical names, such as:
- `Acetone (High Purity ACS)` → `Acetone`
- `Sodium Chloride (Analytical Reagent)` → `Sodium_Chloride`
- `Hydrochloric Acid 37% (ACS Grade)` → `Hydrochloric_Acid`

---

## 2. Mapping of Existing Records to Target IDs

Based on the snapshot of live collections in `heisenberg-6d136`:

| Current Firestore ID | Chemical Name | Target Human-Readable ID | Collision Risk |
| :--- | :--- | :--- | :---: |
| `chem_acetone` | Acetone (High Purity ACS) | `Acetone` | None |
| `chem_ethanol` | Ethanol 95% (Laboratory Grade) | `Ethanol_95` | None |
| `chem_hcl` | Hydrochloric Acid 37% (ACS Grade) | `Hydrochloric_Acid` | None |
| `chem_nacl` | Sodium Chloride (Analytical Reagent) | `Sodium_Chloride` | None |
| `chem_h2o` | Distilled Water (Type II Laboratory) | `Distilled_Water` | None |
| `chem_cuso4` | Copper(II) Sulfate Pentahydrate | `Copper_II_Sulfate_Pentahydrate` | None |
| `chem_iodine` | Iodine Solution 0.1 N | `Iodine_Solution_0_1_N` | None |
| `chem_naoh` | Sodium Hydroxide Pellets | `Sodium_Hydroxide_Pellets` | None |
| `chem_phenolphthalein` | Phenolphthalein 1% Indicator | `Phenolphthalein_1_Indicator` | None |
| `chem_sulfuric` | Sulfuric Acid 98% | `Sulfuric_Acid_98` | None |
| `5byVyABoiYzUSldTT0CT` | Hydrogen dioxide | `Hydrogen_Dioxide` | None |
| `xlqyXoPNKaUGoNo43jv2` | Hydrogen diodide | `Hydrogen_Diodide` | None |

---

## 3. Cross-Collection Reference Impact

### 3.1 Transactions Collection (`/transactions`)
- **Schema:** Transaction documents contain `chemicalId` as a foreign key and `chemicalName` as denormalized text.
- **Security Rule Constraint:** `firestore.rules` specifies:
  ```javascript
  match /transactions/{transactionId} {
    allow read: if true;
    allow create: if hasValidTransactionData();
    allow update, delete: if false; // Immutable audit log
  }
  ```
- **Architectural Requirement:** Because client Web SDK connections are blocked from updating existing transaction documents, reference migration must be run using a privileged **Firebase Admin SDK script** (or Google Cloud Functions/Cloud Shell with service account credentials) that bypasses client security rules.
- **Fallback Compatibility:** The client application (`app.js`) gracefully falls back to `t.chemicalName` if `chemicals.find(c => c.id === t.chemicalId)` is not found, ensuring zero UI breakage even during migration phases.

### 3.2 Suppliers Collection (`/suppliers`)
- **Zero Impact:** Supplier documents do not store chemical IDs. Chemicals link to suppliers via `supplierId` (`chem.supplierId === supp.id`), which remains unchanged during chemical ID migration.

---

## 4. Step-by-Step Migration Procedure

### Phase 1: Pre-Migration Backup (Zero Downtime)
1. Run export script using Firebase CLI or Admin SDK to save full snapshots:
   - `backup_chemicals_<timestamp>.json`
   - `backup_transactions_<timestamp>.json`
2. Verify backup checksums and document counts (12 chemicals).

### Phase 2: Copy to New Human-Readable IDs (Non-Destructive)
1. For each chemical record:
   - Read existing document data from current ID.
   - Atomically create the new document under the target ID (`transaction.get()` then `transaction.set()`).
   - Store an audit metadata property `migratedFrom: "<old_id>"` on the new document.
2. Keep the old documents active during this phase.

### Phase 3: Reference Pointer Updates
1. Using Firebase Admin SDK, query all `/transactions` matching each old `chemicalId`.
2. Update `chemicalId` on matching transactions to the corresponding new human-readable ID.

### Phase 4: Validation & Health Check
1. Open local dashboard at `http://localhost:8085/`.
2. Verify all 12 chemicals render with accurate quantities, units, and status badges.
3. Verify stock movement audit log displays all transactions with matching chemical names.
4. Test Stock IN and Stock OUT on migrated documents.

### Phase 5: Decommission Legacy Documents
1. Once validation passes 100%, delete the old document IDs (`chem_*`, `5byVyABoiYzUSldTT0CT`, `xlqyXoPNKaUGoNo43jv2`).

---

## 5. Rollback Procedure

- **If Failure Occurs in Phase 2 or 3:**
  1. Delete any newly created documents matching the new ID format.
  2. The application will continue operating against the original legacy document IDs.
- **If Failure Occurs after Phase 5 Deletion:**
  1. Re-import documents directly from `backup_chemicals_<timestamp>.json` using `setDoc()`.
  2. Restore original `chemicalId` references in transactions from `backup_transactions_<timestamp>.json`.
