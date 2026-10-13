# College Viva & Examination Guide

## Breaking Bad Heisenberg: Chemical Lab Supply Intelligence

This document compiles the top 20 viva examination questions and answers covering Cloud Computing, Firebase Architecture, NoSQL Firestore, and the project's inventory intelligence algorithms.

---

### Category 1: Cloud Computing & Architecture

#### Q1. What cloud service model does this project demonstrate?
**Answer:** It demonstrates the **Backend-as-a-Service (BaaS)** model of cloud computing. Instead of provisioning and maintaining virtual machines (IaaS) or application servers (PaaS), we consume cloud database (Firestore) and static web hosting (Firebase Hosting) as managed serverless cloud services.

#### Q2. Why did you choose Firebase Hosting over traditional web servers like Apache or Nginx?
**Answer:** Firebase Hosting provides zero-maintenance static web asset delivery over a global Content Delivery Network (CDN) with automated free SSL/HTTPS certificate provisioning, automated atomic deployments, and instant rollback capabilities.

#### Q3. How does this project achieve ₹0 cost on Firebase's Spark Plan?
**Answer:**
1. We strictly utilize services within Firebase's perpetual free tier (Cloud Firestore and Hosting).
2. We avoided **Cloud Functions**, which mandate upgrading to the paid Blaze Plan.
3. All inventory intelligence calculations (critical stock status, expiry warnings, reorder formulas) are computed on the client side in Vanilla JavaScript.
4. Firestore usage is optimized so standard operations consume a fraction of the 50,000 daily read and 20,000 daily write limits.

---

### Category 2: Database & Cloud Firestore

#### Q4. What is Cloud Firestore and how is it different from a Relational Database (RDBMS)?
**Answer:** Cloud Firestore is a cloud-hosted, document-oriented NoSQL database. Unlike RDBMS (like MySQL or PostgreSQL) which store data in rigid tables with rows and columns, Firestore stores JSON-like documents organized into collections with flexible schemas and hierarchical subcollections.

#### Q5. How does the application achieve real-time synchronization across multiple clients?
**Answer:** The application uses Firestore's real-time listener `onSnapshot()`. When any client modifies a document in a collection (e.g. performing Stock-IN), Firestore pushes the updated data snapshot to all listening clients over WebSockets/long-polling without requiring manual page refreshes or polling loops.

#### Q6. What are the collections used in this project, and how are alerts handled?
**Answer:**
1. `chemicals`: Simulated inventory records, stock levels, thresholds, expiry dates, and stock status (`NORMAL`, `LOW`, `CRITICAL`).
2. `suppliers`: Fictional chemical suppliers, contact details, locations, and vendor ratings.
3. `transactions`: Immutable audit log of all Stock-IN (restock) and Stock-OUT (consumption) operations.
4. `alerts`: Provisioned in schema and security rules for persistent broadcast notices. In everyday operation, inventory intelligence alerts (`LOW_STOCK`, `CRITICAL_STOCK`, `EXPIRING_SOON`) are generated dynamically on the client side from the real-time `chemicals` stream (`onSnapshot`). This architecture preserves the Spark Plan free-tier quota (20,000 writes/day) by running alerts at zero database write cost.

#### Q7. Why are transactions made immutable in Firestore security rules?
**Answer:** In chemical laboratory management and supply chains, audit trails must be non-repudiable for safety and regulatory compliance. Our `firestore.rules` allow `create` and `read` for transactions, but strictly set `allow update, delete: if false;` to prevent tampering with historical records.

---

### Category 3: Inventory Intelligence & Business Logic

#### Q8. What is the mathematical condition for Low Stock and Critical Stock?
**Answer:**
- **Normal:** $\text{Quantity} \ge \text{MinimumStock}$
- **Low Stock:** $0.5 \times \text{MinimumStock} \le \text{Quantity} < \text{MinimumStock}$
- **Critical Stock:** $\text{Quantity} < 0.5 \times \text{MinimumStock}$

#### Q9. How is the Reorder Recommendation calculated?
**Answer:**
$$\text{RecommendedOrder} = \max(0, \text{MaximumStock} - \text{CurrentQuantity})$$
If the current stock is already at or above maximum capacity, the recommendation evaluates to $0$.

#### Q10. How does the system detect chemicals expiring soon?
**Answer:** It compares the simulated `expiryDate` with the current date:
$$\Delta \text{Days} = \frac{\text{ExpiryDate} - \text{CurrentDate}}{86,400,000\text{ ms}}$$
- If $\Delta \text{Days} \le 0$: The chemical is flagged as `EXPIRED` in the UI and a critical quarantine alert is raised.
- If $0 < \Delta \text{Days} \le 30$: An `EXPIRING_SOON` warning pill badge is displayed and an amber alert is generated in the feed.
*Important viva distinction:* Expiry is evaluated independently as an alert condition and does not mutate the chemical's inventory balance `status` (which strictly tracks quantity thresholds: `NORMAL`, `LOW`, `CRITICAL`).

#### Q11. How does the system prevent negative inventory?
**Answer:** During Stock-OUT transactions, the client-side validation logic validates `requestedQuantity <= currentQuantity`. If a user attempts to consume more than the available balance, the operation is blocked and a danger toast notification is displayed.

---

### Category 4: Software Engineering & Micro-Project Concepts

#### Q12. Why did you use Vanilla JavaScript instead of React or Angular?
**Answer:** Vanilla JavaScript (ES6 Modules) provides clean, native browser execution without build steps, bundlers, or heavy dependencies. It makes the codebase transparent, lightweight, and easy to explain during a viva evaluation while demonstrating core DOM manipulation, asynchronous programming, and modular design.

#### Q13. What happens if the internet connection is lost or Firebase is not configured?
**Answer:** The application includes an intelligent **Dual-Mode Data Access Layer**. If Firebase credentials are in placeholder mode or network connectivity fails, it automatically falls back to a simulated local storage repository (`localStorage`) that mirrors Firestore collection semantics, ensuring zero interruption during demonstration.

#### Q14. What are the key limitations of this simulation project?
**Answer:**
1. It uses simulated educational chemical data and does not interface with real hazardous supply logistics.
2. In a production enterprise system, role-based authentication (Firebase Auth) and server-side validation via Cloud Functions would be added.
