# Cloud Architecture Specification

## Breaking Bad Heisenberg: Chemical Lab Supply Intelligence

This document details the system and cloud architecture of the **Heisenberg Chemical Lab Supply Intelligence** simulation project.

---

## 1. Architectural Overview

The application adopts a **Serverless 3-Tier Architecture** utilizing **Google Firebase** under the **₹0 Free Spark Plan**.

```mermaid
graph TD
    Client[End User Browser / Web Client] -->|HTTPS Requests / Web Traffic| Hosting[Firebase Hosting CDN]
    Hosting -->|Serves Static Bundle HTML/CSS/JS| Client
    Client -->|Direct NoSQL Queries & Subscriptions via Web SDK v10| Firestore[(Google Cloud Firestore Database)]
    
    subgraph Client-Side Intelligence Engine
        R1[Stock Status Rules Engine]
        R2[Automated Reorder Algorithm]
        R3[Simulated Expiry Warning Monitor]
        R4[Stock In / Out Safety Check]
    end
    
    Client --- Client-Side Intelligence Engine
    
    subgraph Cloud Firestore Collections
        C1[(chemicals)]
        C2[(suppliers)]
        C3[(transactions)]
        C4[(alerts)]
    end
    
    Firestore --- C1
    Firestore --- C2
    Firestore --- C3
    Firestore --- C4
```

---

## 2. Cloud Components Breakdown

| Component | Technology | Role in Project | Cost Model |
| :--- | :--- | :--- | :--- |
| **Presentation Tier** | HTML5, CSS3, ES6 JavaScript | Renders responsive dashboard, reactive tables, interactive charts, and manages user simulation interactions | ₹0 (Runs on client) |
| **Edge & Hosting Tier** | Firebase Hosting | Global CDN hosting, SSL termination, caching for HTML/CSS/JS assets | ₹0 (Included in Spark Tier) |
| **Data & Persistence Tier**| Google Cloud Firestore | NoSQL document database storing inventory, suppliers, immutable audit logs, and dynamic alerts | ₹0 (Spark Plan: 50k reads, 20k writes/day) |
| **Compute / Rules Engine** | Client-Side Vanilla JS | Performs mathematical formulas for reorder recommendations, thresholds, and safety checks | ₹0 (No Cloud Functions) |

---

## 3. Why ₹0 Spark Plan Compliance is Guaranteed

1. **Elimination of Cloud Functions:**
   - On Firebase, Google Cloud Functions requires the pay-as-you-go **Blaze Plan**.
   - By executing the inventory intelligence computations directly in client-side JavaScript, we completely bypass the need for Cloud Functions.
2. **Direct Web SDK Integration:**
   - The frontend communicates directly with Cloud Firestore via standard HTTPS/gRPC channels using the Firebase Web SDK v10 CDN bundle.
3. **Optimized Firestore Reads/Writes:**
   - Efficient document schema structures ensure standard daily laboratory transactions consume less than 0.1% of the daily free limits (50,000 reads/day, 20,000 writes/day, 1 GiB total storage).

---

## 4. Key Cloud Concepts Demonstrated

- **Backend-as-a-Service (BaaS):** Utilizing managed cloud storage without provisioning or maintaining operating systems or virtual machine instances.
- **Edge Deployment & Global CDN:** Distributing frontend assets close to the end user for low latency.
- **Real-Time Data Synchronization:** Using WebSocket/long-polling event listeners (`onSnapshot`) to reflect database updates across all active client sessions immediately without manual polling.
- **Stateless Architecture:** Application state is stored securely in the cloud database, enabling horizontal scalability across any number of concurrent clients.
