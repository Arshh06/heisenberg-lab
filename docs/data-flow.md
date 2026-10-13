# Data Flow & Simulation Workflows

## Breaking Bad Heisenberg: Chemical Lab Supply Intelligence

This document specifies the exact sequence of events, math equations, and state transitions for simulation workflows.

---

## 1. Stock-IN (Restock / Procurement) Data Flow

When a lab technician or researcher records a chemical restock:

```mermaid
sequenceDiagram
    autonumber
    actor User as Lab User / Technician
    participant UI as Web Dashboard (Browser)
    participant Rules as Client Intelligence Engine
    participant DB as Cloud Firestore

    User->>UI: Select Chemical, Enter Quantity & Notes
    UI->>Rules: Validate (quantity > 0)
    Rules->>Rules: Calculate newQty = currentQty + delta
    Rules->>Rules: Recalculate status = calculateStockStatus(newQty, minStock)
    UI->>DB: addDoc("transactions", {type: "IN", quantity: delta, ...})
    UI->>DB: updateDoc("chemicals", chemId, {quantity: newQty, status: newStatus})
    DB-->>UI: Real-time Event (onSnapshot triggered)
    UI->>Rules: Refresh Alerts & Reorder Metrics
    UI->>User: Display Success Toast & Updated Dashboard
```

---

## 2. Stock-OUT (Consumption) Data Flow (With Safety Guard)

When a chemical is consumed for an experiment, the system strictly protects against overdraw:

```mermaid
sequenceDiagram
    autonumber
    actor User as Lab User / Researcher
    participant UI as Web Dashboard (Browser)
    participant Safety as Client Safety Validator
    participant Rules as Client Intelligence Engine
    participant DB as Cloud Firestore

    User->>UI: Select Chemical, Enter Quantity to Consume
    UI->>Safety: Check (requestedQty <= currentQty)
    alt Requested Quantity > Available Stock
        Safety-->>UI: Error: Insufficient Stock
        UI-->>User: Show Danger Toast: "Cannot overdraw inventory"
    else Safe Quantity
        Safety->>Rules: Calculate newQty = currentQty - requestedQty
        Rules->>Rules: Recalculate status = calculateStockStatus(newQty, minStock)
        UI->>DB: addDoc("transactions", {type: "OUT", quantity: requestedQty, ...})
        UI->>DB: updateDoc("chemicals", chemId, {quantity: newQty, status: newStatus})
        DB-->>UI: Real-time Event (onSnapshot triggered)
        UI->>Rules: Evaluate if alert threshold crossed (LOW / CRITICAL)
        UI->>User: Display Success Toast & Updated Dashboard
    end
```

---

## 3. Inventory Intelligence Decision Logic

```mermaid
flowchart TD
    Start([Evaluate Chemical Stock]) --> CheckMin{Is quantity >= minimumStock?}
    CheckMin -- Yes --> Normal[Status: NORMAL]
    CheckMin -- No --> CheckCrit{Is quantity < minimumStock * 0.5?}
    
    CheckCrit -- Yes --> Critical[Status: CRITICAL<br>Trigger Critical Alert<br>Severity: Red]
    CheckCrit -- No --> Low[Status: LOW<br>Trigger Low Alert<br>Severity: Amber]

    Normal --> CheckExp{Simulated Expiry <= 30 Days?}
    Critical --> CheckExp
    Low --> CheckExp

    CheckExp -- Yes --> ExpAlert[Trigger EXPIRING_SOON Alert]
    CheckExp -- No --> CalcOrder[Calculate Reorder Recommendation]
    ExpAlert --> CalcOrder

    CalcOrder --> Formula["recommendedOrder = Math.max(0, maximumStock - quantity)"]
    Formula --> End([Render Dashboard Badges & Charts])
```

---

## 4. Mathematical Formulations

### 4.1 Stock Status Formula
$$\text{Status}(Q, M) = \begin{cases} 
\text{CRITICAL}, & \text{if } Q < 0.5 \times M \\
\text{LOW}, & \text{if } 0.5 \times M \le Q < M \\
\text{NORMAL}, & \text{if } Q \ge M 
\end{cases}$$

*Where $Q$ is current chemical quantity, and $M$ is minimum stock threshold.*

### 4.2 Automated Reorder Quantity Formula
$$\text{Reorder Quantity}(Q, \text{Max}) = \begin{cases}
0, & \text{if } Q \ge \text{Max} \\
\text{Max} - Q, & \text{if } Q < \text{Max}
\end{cases}$$

*Where $\text{Max}$ is the maximum target storage capacity.*

### 4.3 Shelf-Life Expiry Warning Formula
$$\Delta T = \text{Date}_{\text{expiry}} - \text{Date}_{\text{today}}$$
$$\text{Expiry Alert} = \begin{cases}
\text{EXPIRED}, & \text{if } \Delta T < 0 \\
\text{EXPIRING\_SOON}, & \text{if } 0 \le \Delta T \le 30\text{ days} \\
\text{VALID}, & \text{if } \Delta T > 30\text{ days}
\end{cases}$$
