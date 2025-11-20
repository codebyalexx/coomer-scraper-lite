# Multi-Proxy System - Quick Start Guide

## 5-Minute Setup

### Step 1: Update Environment Configuration

Add the following to your `.env` file (copy from `.env.dist` if needed):

```bash
# Basic proxy configuration (using only localhost - backward compatible)
PROXY_POST_LIMIT=2
PROXY_ATTACHMENT_LIMIT=4
PROXY_DOWNLOAD_TIMEOUT=600000
PROXY_MAX_REDIRECTS=1
PROXY_SKIP_CACHE_TTL=3600
PROXY_MAX_RETRIES=3
PROXY_RETRY_BACKOFF=2
PROXY_RETRY_BASE_DELAY=1000

# If you don't have proxies, leave this empty (uses localhost only)
PROXY_LIST=
```

### Step 2: That's It!

The system works automatically with existing code:

```javascript
// Your existing code - NO CHANGES NEEDED
import { downloadFile } from "./lib/downloader-multi-proxy.js";
await downloadFile(attachment);
```

---

## Using With Proxies

### Adding a Single Remote Proxy

```bash
# .env file
PROXY_LIST=[{"isLocalhost":true},{"ip":"proxy.example.com","port":3128}]
```

This creates 2 proxies, each with their own 2×4 concurrency:
- Localhost: 2 posts × 4 attachments = 8 concurrent
- Proxy.example.com: 2 posts × 4 attachments = 8 concurrent
- **Total: 16 concurrent downloads**

### Adding Multiple Proxies

```bash
# .env file
PROXY_LIST=[{"isLocalhost":true},{"ip":"proxy1.com","port":3128},{"ip":"proxy2.com","port":3128},{"ip":"proxy3.com","port":3128}]
```

4 proxies × 8 concurrent = **32 concurrent downloads**

### Adding Proxies with Authentication

```bash
# .env file
PROXY_LIST=[{"isLocalhost":true},{"ip":"secure-proxy.com","port":3128,"username":"myuser","password":"mypass"}]
```

---

## Increasing Throughput

### Option A: Increase Concurrency Per Proxy

```bash
# .env file
PROXY_POST_LIMIT=4        # Was 2, now 4 posts per proxy
PROXY_ATTACHMENT_LIMIT=8  # Was 4, now 8 attachments per post

# 1 proxy: 4 × 8 = 32 concurrent
# 2 proxies: 4 × 8 × 2 = 64 concurrent
```

### Option B: Add More Proxies

```bash
# .env file
PROXY_LIST=[{"isLocalhost":true},{"ip":"proxy1.com","port":3128},{"ip":"proxy2.com","port":3128},{"ip":"proxy3.com","port":3128},{"ip":"proxy4.com","port":3128}]

# 5 proxies × 2 × 4 = 40 concurrent downloads
```

### Option C: Combine Both

```bash
# .env file
PROXY_POST_LIMIT=3
PROXY_ATTACHMENT_LIMIT=6
PROXY_LIST=[{"isLocalhost":true},{"ip":"proxy1.com","port":3128},{"ip":"proxy2.com","port":3128}]

# 3 proxies × 3 × 6 = 54 concurrent downloads
```

---

## Monitoring Downloads

### View Download Statistics

```javascript
import { getOrchestratorStats } from "./lib/downloader-multi-proxy.js";

// Get overall statistics
const stats = await getOrchestratorStats();
console.log(`Downloaded: ${stats.totalTasksCompleted} files`);
console.log(`Failed: ${stats.totalTasksFailed} files`);
console.log(`Active proxies: ${stats.proxyCount}`);

// View per-proxy statistics
for (const [proxyId, proxyStats] of Object.entries(stats.proxyStats)) {
  console.log(`${proxyId}: ${proxyStats.successCount} success, ${proxyStats.failureCount} failed`);
}
```

### Check Proxy Health

```javascript
import { getProxyHealth } from "./lib/downloader-multi-proxy.js";

const health = await getProxyHealth();

for (const [proxyId, healthData] of Object.entries(health)) {
  console.log(`${proxyId}: ${healthData.status} (${healthData.failureCount} failures)`);
}
```

---

## Troubleshooting

### Problem: "No available proxies" Error

**Cause:** PROXY_LIST configuration is invalid JSON

**Fix:** Validate your PROXY_LIST:
```bash
# ✅ Valid
PROXY_LIST=[{"isLocalhost":true}]

# ❌ Invalid (missing curly braces)
PROXY_LIST=[isLocalhost: true]

# ❌ Invalid (missing quotes)
PROXY_LIST=[{isLocalhost: true}]
```

### Problem: Downloads Are Slow

**Cause:** Concurrency limits too low

**Fix:**
```bash
# Increase limits gradually
PROXY_POST_LIMIT=4
PROXY_ATTACHMENT_LIMIT=8

# Monitor impact and increase further if needed
PROXY_POST_LIMIT=6
PROXY_ATTACHMENT_LIMIT=10
```

### Problem: Proxy Connection Errors

**Cause:** Unreachable proxy or bad credentials

**Fix:**
```bash
# Test proxy manually first
curl -x "http://user:pass@proxy.com:3128" https://coomer.st

# If curl fails, the proxy config is wrong
# Check IP, port, username, and password
```

### Problem: "File marked as skipped" Messages

**Cause:** Download timeout (file marked in Redis to skip for 1 hour)

**Fix:**
```bash
# Increase timeout
PROXY_DOWNLOAD_TIMEOUT=900000  # 15 minutes instead of 10

# Or reduce skip cache duration to retry faster
PROXY_SKIP_CACHE_TTL=1800      # 30 minutes instead of 1 hour
```

### Problem: High Memory Usage

**Cause:** Too many concurrent connections

**Fix:**
```bash
# Reduce concurrency
PROXY_POST_LIMIT=1
PROXY_ATTACHMENT_LIMIT=2

# Or remove extra proxies
PROXY_LIST=[{"isLocalhost":true}]
```

---

## Real-World Examples

### Example 1: Scraper with Single Proxy (Recommended Starting Point)

```bash
# .env
PROXY_POST_LIMIT=2
PROXY_ATTACHMENT_LIMIT=4
PROXY_DOWNLOAD_TIMEOUT=600000
PROXY_MAX_REDIRECTS=1
PROXY_SKIP_CACHE_TTL=3600
PROXY_MAX_RETRIES=3
PROXY_RETRY_BACKOFF=2
PROXY_RETRY_BASE_DELAY=1000
PROXY_LIST=[{"isLocalhost":true}]

# Result: 2 × 4 = 8 concurrent downloads
# No changes to app.js needed!
```

### Example 2: High-Speed Scraper with 3 Proxies

```bash
# .env
PROXY_POST_LIMIT=3
PROXY_ATTACHMENT_LIMIT=6
PROXY_DOWNLOAD_TIMEOUT=600000
PROXY_MAX_REDIRECTS=1
PROXY_SKIP_CACHE_TTL=3600
PROXY_MAX_RETRIES=3
PROXY_RETRY_BACKOFF=2
PROXY_RETRY_BASE_DELAY=1000
PROXY_LIST=[{"isLocalhost":true},{"ip":"proxy1.example.com","port":3128},{"ip":"proxy2.example.com","port":3128}]

# Result: 3 proxies × 3 × 6 = 54 concurrent downloads
```

### Example 3: Conservative Scraper (Low Resource Usage)

```bash
# .env
PROXY_POST_LIMIT=1
PROXY_ATTACHMENT_LIMIT=2
PROXY_DOWNLOAD_TIMEOUT=600000
PROXY_MAX_REDIRECTS=1
PROXY_SKIP_CACHE_TTL=3600
PROXY_MAX_RETRIES=3
PROXY_RETRY_BACKOFF=2
PROXY_RETRY_BASE_DELAY=1000
PROXY_LIST=[{"isLocalhost":true}]

# Result: 1 × 2 = 2 concurrent downloads (low resource usage)
```

### Example 4: Load-Balanced Scraper with Authentication

```bash
# .env
PROXY_POST_LIMIT=2
PROXY_ATTACHMENT_LIMIT=4
PROXY_DOWNLOAD_TIMEOUT=600000
PROXY_MAX_REDIRECTS=1
PROXY_SKIP_CACHE_TTL=3600
PROXY_MAX_RETRIES=3
PROXY_RETRY_BACKOFF=2
PROXY_RETRY_BASE_DELAY=1000
PROXY_LIST=[{"isLocalhost":true},{"ip":"proxy1.company.com","port":3128,"username":"scraper","password":"secure123"},{"ip":"proxy2.company.com","port":3128,"username":"scraper","password":"secure123"}]

# Result: 3 proxies × 2 × 4 = 24 concurrent downloads
# All proxies authenticated and balanced
```

---

## Next Steps

1. **Start Simple:** Use default configuration (localhost only) first
2. **Monitor:** Use `getOrchestratorStats()` to track performance
3. **Add Proxies:** Gradually add remote proxies if needed
4. **Tune:** Adjust concurrency limits based on your network
5. **Scale:** Add more proxies or increase limits for higher throughput

---

## Common Commands for Integration

### List All Proxies in Use
```javascript
const orchestrator = await getGlobalOrchestrator();
const health = orchestrator.getProxyHealth();
Object.keys(health).forEach(proxyId => {
  console.log(`Proxy: ${proxyId}`);
});
```

### Reset Download Statistics
```javascript
const orchestrator = await getGlobalOrchestrator();
orchestrator.downloaders.forEach(d => d.resetStats());
```

### View Current Queue Size
```javascript
const orchestrator = await getGlobalOrchestrator();
console.log(`Tasks in queue: ${orchestrator.taskQueue.getQueueSize()}`);
```

### Gracefully Shutdown
```javascript
import { shutdownOrchestrator } from "./lib/downloader-multi-proxy.js";
await shutdownOrchestrator();
```

---

## Performance Expectations

| Setup | Concurrency | Throughput | Use Case |
|-------|-------------|-----------|----------|
| Default (1 proxy, 2×4) | 8 | ~1-3 files/sec | Testing, safe baseline |
| 2 proxies (2×4) | 16 | ~2-6 files/sec | Standard production |
| 3 proxies (3×6) | 54 | ~5-15 files/sec | High-speed scraping |
| 5 proxies (4×8) | 160 | ~10-30 files/sec | Maximum throughput |

*Actual throughput depends on file sizes, network speed, and proxy performance*

---

## Zero-Configuration Usage

If you do nothing:
- ✅ System uses localhost only (backward compatible)
- ✅ Existing code continues to work unchanged
- ✅ All proxy features available when you're ready
- ✅ No performance impact from unused features

Just install the new files and you're done!
