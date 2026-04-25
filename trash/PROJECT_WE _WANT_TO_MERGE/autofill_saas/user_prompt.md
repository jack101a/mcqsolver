You are a senior system architect, product designer, and AI workflow engineer.

Your goal is to DESIGN a complete production-grade system.

DO NOT write code yet.

---

🧠 AGENT RULES (STRICT)

You are working on a long-term system. Follow these rules strictly:

1. NO HALLUCINATION

- Do not assume missing details
- If unclear → define explicitly with assumptions
- Do NOT invent APIs, files, or features

2. ARCHITECTURE FIRST

- All decisions must be intentional and structured
- Do not jump into implementation

3. CONSISTENCY

- Use consistent naming, modules, and patterns
- Avoid contradictions across sections

4. THINK LIKE A CTO

- Focus on scalability, security, maintainability

---

📊 CURRENT STATE

- Completed: None
- In Progress: Planning
- Pending: Full system

---

📌 PHASE 1: UNDERSTANDING

- Break down the problem
- Define system goals
- Identify user flows
- List assumptions clearly

---

🏗️ PHASE 2: SYSTEM ARCHITECTURE

Define:

- Frontend (tech + role)
- Backend (services + APIs)
- Database (schema design + relations)
- Auth system
- AI / automation components
- Browser extension (if needed)
- External integrations

---

🧩 PHASE 3: FEATURE BREAKDOWN

Split into:

- MVP features
- Advanced features
- Scaling features

---

🗺️ PHASE 4: EXECUTION ROADMAP

- Step-by-step build order
- Module dependencies
- Folder structure
- Milestone plan (phases)

---

⚠️ PHASE 5: RISKS & OPTIMIZATION

- Bottlenecks
- Security risks
- Performance improvements
- Scaling strategy

---

📦 OUTPUT FORMAT

- Structured sections only
- No code
- Clear headings
- Think deeply before answering

---

🚨 PROJECT IDEA (PASTE BELOW)

"""
You are a senior system architect, product designer, and AI workflow engineer.

Your task is to design a COMPLETE SaaS-based intelligent autofill and workflow automation system.

---

## OBJECTIVE

Design a full-scale autofill ecosystem that includes:
- Browser extensions (Chrome + Firefox)
- Backend server infrastructure
- Intelligent autofill system (rule-based + AI-assisted)
- Multi-step workflow automation
- Secure user data management with sync and device binding
- CAPTCHA solving system
- Enterprise-grade reliability, security, and compliance
- AI-powered adaptive learning system

---

## ARCHITECTURE APPROACH

The system follows a **layered hybrid architecture**:

1. Rule-Based Autofill Layer  
   - Handles known fields and predefined mappings  
   - Ensures speed, predictability, and reliability  
   - Acts as first-pass execution layer  

2. AI Assistance Layer  
   - Activated when rule-based mapping fails  
   - Performs semantic field detection and mapping  
   - Provides intelligent suggestions with confidence scores  

3. Workflow Engine Layer  
   - Executes multi-step and multi-page processes  
   - Maintains state across navigation  
   - Supports branching, retry, and conditions  

4. SaaS Backend Layer  
   - Handles authentication, profiles, workflows, storage  
   - Manages API keys, device binding, sync  
   - Central control for AI and workflows  

5. Execution Mode Layer  
   - Controls how actions are executed:
     - Manual  
     - Assisted  
     - Fully Automated  
   - Configurable per user, site, and workflow  

---

## EXECUTION MODE

The system must support a **configurable hybrid execution model**:

1. Manual Mode  
   - User explicitly triggers all actions  
   - No automatic execution  

2. Assisted Mode  
   - System suggests actions  
   - Requires user confirmation  

3. Fully Automated Mode  
   - System executes actions automatically  
   - Minimal user interaction  

Modes must be configurable per:
- User  
- Website  
- Workflow  

---

## EXTENSION INTERFACE LAYER

The browser extension must support **three interaction layers**:

### 1. Popup Interface (Lightweight Control Panel)
- Autofill toggle  
- Record toggle  
- Status indicator:
  - Green (active), Red (inactive), activity ping  
- Day/Night toggle (top-right)  
- Workflow selector (input box)  
- Prominent “Run Workflow” button  
- Login status + plan badge + upgrade button  

### 2. Inline Overlay Interface (In-Page Assistant)
- Field highlighting  
- Autofill suggestions  
- Workflow step guidance  
- Confirmation prompts  
- Real-time feedback  

### 3. Options Page (Primary Control Hub)
- Account management  
- Profiles & datasets  
- Workflow builder/editor  
- Execution mode settings  
- AI settings  
- Security & device management  

All interfaces must:
- Stay synchronized in real-time  
- Reflect execution mode  
- Provide clear system feedback  

---

## BACKEND ARCHITECTURE

The system uses a **hybrid backend model**:

### 1. Lightweight Extension (Client)
- DOM interaction and detection  
- Sends structured context to backend  
- Executes actions in browser  

### 2. Heavy Backend Server
- AI inference (ONNX models)  
- Workflow execution logic  
- Data storage and management  
- Authentication and subscription control  

### 3. Communication Layer
- Secure API communication  
- Token-based authentication  
- Low-latency responses  

---

## USER DATA MODEL

Hybrid structure:

1. Structured Fields  
   - Name, email, phone, address, IDs  

2. Custom Fields  
   - User-defined fields (text, number, date, file)  

3. Data Organization  
   - Multiple profiles/datasets  

4. Mapping Compatibility  
   - Works with rule engine, AI, workflows  

---

## FORM ELEMENT HANDLING & SELECTOR SYSTEM

1. Supported Elements  
   - Text, textarea, checkbox, radio  
   - Dropdown, date/time, file upload  
   - Custom JS framework inputs  

2. Smart Selector Engine  
   - Priority: ID → Name → Label → Context  
   - Avoid brittle selectors  

3. Context-Aware Detection  
   - Based on labels, grouping, semantics  

4. Interaction Engine  
   - Correct behavior per element type  

5. Event Simulation  
   - input, change, blur events  

6. Validation Layer  
   - Confirm successful autofill  

---

## WORKFLOW SYSTEM

Hybrid workflow system:

1. Predefined Templates  
2. No-Code Workflow Builder  
3. Multi-step execution  
4. State tracking  
5. Reusability  

---

## WORKFLOW LOGIC & CONTROL

- Conditional logic (IF/ELSE)  
- Event triggers (DOM, page load)  
- Branching logic  
- Looping & retry  
- Fallback handling  

---

## SMART WORKFLOW RECORDER

- Captures user actions  
- Converts into structured workflows  
- Maps inputs to data fields  
- Optimizes selectors  
- Editable and reusable  
- AI-enhanced improvements  

---

## ERROR HANDLING & RECOVERY

- Step-level detection  
- Retry strategies  
- Fallback switching  
- User intervention  
- Detailed logging  

---

## AI ARCHITECTURE

- Fully server-side AI  
- ONNX-based inference  
- Central model control  

---

## AI BEHAVIOR & RESPONSIBILITY

- Field mapping  
- Assisted decision-making  
- Controlled execution  
- Confidence scoring  
- Fallback logic  

---

## AI MODEL PIPELINE

- Pre-trained + fine-tuned models  
- Data collection from usage  
- ONNX conversion  
- Continuous learning loop  
- Performance optimization  

---

## CAPTCHA HANDLING SYSTEM

- Detect all CAPTCHA types  
- ONNX OCR + vision models  
- Strategy-based solving  
- Hybrid fallback (manual + external APIs)  
- Integrated into workflows  

---

## AUTHENTICATION & SUBSCRIPTION SYSTEM

- Email-based login (no OAuth)  
- Token-based authentication  
- Device binding  

### Extension Integration
- Popup: login status + upgrade  
- Options: full account control  

### Subscription
- Backend-managed  
- Feature gating  
- External billing integration  

---

## CROSS-DEVICE SYNC SYSTEM

- Account-based sync (paid users)  
- Sync profiles, workflows, settings  
- Auto + manual sync  
- Conflict resolution  
- Device management  

---

## DUMMY DATA AUTOFILL SYSTEM

- Templates + random generation  
- Toggle in extension  
- Separate from real data  
- Realistic formatting  

---

## DATABASE & API ARCHITECTURE

### Hybrid Database
- SQL → users, auth, billing  
- NoSQL → workflows, logs, AI  

### API Layer
- Secure endpoints  
- Token auth  
- Rate limiting  
- Optional real-time updates  

---

## ADMIN DASHBOARD SYSTEM

- Multi-role access  
- User management  
- Workflow management  
- AI monitoring  
- CAPTCHA monitoring  
- Logs & audit  
- System config  

---

## SECURITY & ACCESS CONTROL

- Zero-trust architecture  
- Encryption (at rest + transit)  
- Token authentication  
- Device binding  
- Audit logs  
- Rate limiting  

---

## COMPLIANCE & DATA PRIVACY

- GDPR-like compliance  
- Data ownership  
- Consent  
- Data minimization  
- Right to erasure  
- Transparency  

---

## BACKUP, RESTORE & DISASTER RECOVERY

- Real-time replication  
- Scheduled snapshots  
- Multi-region storage  
- Failover system  
- Point-in-time recovery  
- Integrity validation  
- Monitoring & alerts  

---

## INPUT DEFINITIONS

- DOM data  
- User data  
- Files/documents  
- System context  
- External APIs (future)  

---

## OUTPUT REQUIREMENTS

- Actions  
- Reasoning  
- Logs  
- Confidence scores  
- User feedback  

---

## EXECUTION FLOW

1. Trigger (manual + event-based)  
2. Context collection  
3. Processing (rule → AI → workflow)  
4. Decision  
5. Execution  
6. Monitoring  
7. Learning  

---

## MONETIZATION & SAAS MODEL

- Freemium tier  
- Subscription plans  
- Usage-based pricing (AI, CAPTCHA)  
- API plans  
- Feature gating  
- Admin controls  

---

## SYSTEM PRINCIPLES

- Modular  
- Scalable  
- Secure  
- AI-assisted but controlled  
- User-centric UX (simple → advanced)  

---
"""