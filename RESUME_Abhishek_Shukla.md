# ABHISHEK SHUKLA
**Software Engineer** | India | `abhishekshukla22114@gmail.com` | [GitHub](https://github.com/abhishekshukla22114-rgb) | [LinkedIn](https://linkedin.com/in/abhishekshukla)

---

## EDUCATION
**Bachelor of Computer Applications (BCA)** — *United University, Prayagraj*  
Expected Graduation: **2025** | CGPA: **8.2/10**  
Relevant Coursework: Data Structures & Algorithms, Operating Systems, Computer Networks, Database Management Systems, Web Technologies

---

## TECHNICAL SKILLS
| Category | Technologies |
|----------|--------------|
| **Languages** | C++, TypeScript, JavaScript (ES6+), SQL, HTML5, CSS3 |
| **Frontend** | React.js, Vite, Tailwind CSS, Responsive Web Design, DOM Manipulation, Virtualization (Windowing) |
| **Backend** | Node.js, Express.js, RESTful APIs, WebSockets (Socket.io, ws), Rate Limiting, JWT Authentication, RBAC |
| **Databases & Stores** | PostgreSQL, MongoDB, Redis (Pub/Sub, Caching, Bitfields), Drizzle ORM |
| **DevOps & Systems** | Docker, Nginx (basics), Microservices Architecture, Linux CLI, Git/GitHub, CI/CD |

---

## PROJECTS

### **One Million Checkboxes** — *Massive Concurrent Real-Time Application*  
**Tech:** React.js, Node.js, TypeScript, WebSockets (ws), Redis Bitfields, Docker  
[GitHub](https://github.com/abhishekshukla22114-rgb/one-million-checkboxes) | [Live Demo](https://your-demo-url.com)

- **Architected a distributed real-time platform** synchronizing **1,000,000 interactive checkboxes** across concurrent global connections via low-latency WebSockets, achieving **sub-50ms update propagation**.
- **Reduced memory footprint to ~125 KB** (vs 10+ MB JSON) by leveraging **Redis Bitfield operations** and binary packet streaming (`ArrayBuffer`/`Uint8Array`) for state transfer.
- **Implemented frontend windowing/virtualization** rendering only visible viewport elements (100×10 grid), sustaining **60 FPS** scrolling through 100,000 rows without DOM choking.
- **Deployed token-bucket rate limiting + Redis sliding-window counters** mitigating DoS/spam clicks; handled **10K+ concurrent WebSocket connections** with horizontal scaling via Redis Pub/Sub.
- **Containerized with multi-stage Docker builds**; orchestrated PostgreSQL + Valkey (Redis) + App via `docker-compose` with health checks and graceful shutdown.

---

### **High-Performance Collaborative Backend Service**  
**Tech:** Node.js, Express, TypeScript, PostgreSQL, Drizzle ORM, Redis Pub/Sub, Docker  
[GitHub](https://github.com/abhishekshukla22114-rgb/collab-backend)

- **Designed RESTful APIs with connection pooling (pg.Pool)** and query optimization, reducing **p95 DB latency from 120ms → 18ms** under load.
- **Built distributed state sync** using Redis Pub/Sub for event-driven communication across service instances; enabled real-time collaboration features.
- **Implemented JWT-based auth with RBAC**, refresh-token rotation, and centralized error handling (Helmet, CORS, express-rate-limit); secured all mutating endpoints.
- **Achieved 99.9% uptime** in load tests (k6, 500 VUs) with zero data races via optimistic locking and Redis atomic ops.

---

## PROBLEM SOLVING & ACHIEVEMENTS
- **LeetCode:** 250+ problems solved (C++), focusing on Graphs, DP, Two Pointers, Sliding Window, Bit Manipulation
- **Competitive Programming:** Active on Codeforces/GeeksforGeeks; top 15% in university hackathons (3× winner)
- **Open Source:** Contributed to Redis/Node.js ecosystem tooling; maintainer of personal utility libraries

---

## ADDITIONAL
- **Languages:** English (Professional), Hindi (Native)
- **Interests:** Distributed Systems, Real-time Infrastructure, Performance Engineering, Compiler Design