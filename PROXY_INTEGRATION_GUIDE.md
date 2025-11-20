# Multi-Proxy System - Integration Guide

## Overview

This guide shows how to optionally integrate the multi-proxy system more deeply with your existing code. The system works perfectly fine with **zero code changes**, but you may want to take advantage of advanced features.

---

## Current State (No Changes Needed)

Your existing `app.js` code works exactly as-is:

```javascript
// app.js - ZERO CHANGES REQUIRED
import { downloadFile } from "./lib/downloader-multi-proxy.js";

// Downloads automatically route through proxy system if configured
await downloadFile(attachment, 0);
```

**Benefits of current setup:**
- ✅ Backward compatible
- ✅ Automatic proxy routing
- ✅ No code modifications needed
- ✅ All proxy features available via environment variables

---

## Optional: Enhanced Batch Download Integration

If you want to use the batch download features for better performance, you can optionally refactor the attachment download loop:

### Before (Original Code)

```javascript
// app.js - Original implementation
const attachmentTasks = parsedAttachments.map((attachment) =>
  attachmentLimit(async () => {
    try {
      if (fs.existsSync(attachment.outputFilePath)) return;

      let fileDB = await prisma.file.findFirst({
        where: {
          filename: attachment.filename,
          postId: postDB.id,
          artistId: artist.id,
        },
      });

      if (fileDB) return;

      await downloadFile(attachment, 0);

      await prisma.file.create({
        data: {
          url: attachment.url,
          filename: attachment.filename,
          postId: postDB.id,
          artistId: artist.id,
        },
      });

      totalFilesCount++;
    } catch (e) {
      console.error(
        `Failed to download attachment ${
          attachment.filename
        }, error: ${e.message || "no error message"}`,
      );
    }
  }),
);

await Promise.all(attachmentTasks);
```

### After (Proxy-Aware Version - Optional)

```javascript
// app.js - Optional enhanced version
import { downloadFileWithProxy } from "./lib/downloader-multi-proxy.js";

const attachmentTasks = parsedAttachments.map((attachment) =>
  attachmentLimit(async () => {
    try {
      if (fs.existsSync(attachment.outputFilePath)) return;

      let fileDB = await prisma.file.findFirst({
        where: {
          filename: attachment.filename,
          postId: postDB.id,
          artistId: artist.id,
        },
      });

      if (fileDB) return;

      // Use proxy-aware downloader (more reliable, better error handling)
      const result = await downloadFileWithProxy(attachment);
      
      if (!result.success) {
        throw new Error(`Download failed: ${result.error || 'Unknown error'}`);
      }

      await prisma.file.create({
        data: {
          url: attachment.url,
          filename: attachment.filename,
          postId: postDB.id,
          artistId: artist.id,
        },
      });

      totalFilesCount++;
    } catch (e) {
      console.error(
        `Failed to download attachment ${
          attachment.filename
        }, error: ${e.message || "no error message"}`,
      );
    }
  }),
);

await Promise.all(attachmentTasks);
```

**Key Differences:**
- ✅ Better error handling with result object
- ✅ Improved retry logic with exponential backoff
- ✅ Automatic proxy selection and load balancing
- ✅ Better logging and statistics

---

## Advanced: Full Batch Processing Integration

For maximum performance with the multi-proxy system, you can use batch processing:

### Option A: Minimal Changes (Recommended)

Keep your existing post/attachment loop structure but add statistics tracking:

```javascript
// app.js - Minimal integration
import { 
  downloadFileWithProxy,
  getOrchestratorStats 
} from "./lib/downloader-multi-proxy.js";

async function main() {
  // ... existing code ...
  
  for (const artist of uniqueArtists) {
    try {
      // ... existing code for posts ...
      
      // Use new downloader for individual files
      const attachmentTasks = parsedAttachments.map((attachment) =>
        attachmentLimit(async () => {
          try {
            if (fs.existsSync(attachment.outputFilePath)) return;
            
            const result = await downloadFileWithProxy(attachment);
            if (result.success) totalFilesCount++;
          } catch (e) {
            console.error(`Download failed: ${e.message}`);
          }
        }),
      );
      
      await Promise.all(attachmentTasks);
      
      // View statistics after batch
      const stats = await getOrchestratorStats();
      console.log(`Current stats: ${stats.totalTasksCompleted} completed, ${stats.totalTasksFailed} failed`);
      
    } catch (e) {
      console.error(`Failed to process artist: ${e.message}`);
    }
  }
}
```

### Option B: Full Refactor (Advanced)

Completely rewrite the loop to leverage orchestrator's batch features:

```javascript
// app.js - Full proxy-aware implementation
import { 
  downloadPostBatchWithProxy,
  getOrchestratorStats,
  getProxyHealth,
  shutdownOrchestrator
} from "./lib/downloader-multi-proxy.js";

async function processArtist(artist, selectedPosts) {
  try {
    // Prepare batch processor function
    async function preparePostAttachments(post) {
      const postContent = await getPostContent(artist.url, post.id);
      
      const attachments = [];
      if (postContent?.post?.attachments) {
        attachments.push(...postContent.post.attachments);
      }
      if (postContent?.videos) {
        attachments.push(...postContent.videos);
      }
      
      return attachments.map((attachment) => ({
        url: `https://coomer.st/data${attachment.path}`,
        path: "/data" + attachment.path,
        filename: attachment.name,
        outputPath: path.join(
          process.env.DOWNLOAD_DIR,
          artist.identifier,
        ),
        outputFilename: attachment.name,
        outputFilePath: path.join(
          process.env.DOWNLOAD_DIR,
          artist.identifier,
          attachment.name,
        ),
        artistIdentifier: artist.identifier,
      }));
    }
    
    // Use batch download with proxy orchestrator
    const batchResult = await downloadPostBatchWithProxy(
      selectedPosts,
      preparePostAttachments
    );
    
    console.log(
      `Artist ${artist.name}: ${batchResult.successFiles}/${batchResult.totalFiles} files downloaded in ${batchResult.duration}ms`
    );
    
    // Record files in database
    // (You'd need to refactor this part to match orchestrator results)
    
    return batchResult;
    
  } catch (e) {
    console.error(`Failed to process artist ${artist.name}: ${e.message}`);
    return null;
  }
}

async function main() {
  let nodl = process.argv.includes("--nodl");

  if (nodl) {
    console.log("Download disabled.");
    return;
  }

  // ... existing initialization code ...

  let artistsProcessed = 0;
  const artistStats = [];
  
  for (const artist of uniqueArtists) {
    try {
      // ... existing artist/posts loading code ...
      
      // Process with proxy system
      const result = await processArtist(artist, selectedPosts);
      if (result) {
        artistStats.push({
          artist: artist.name,
          ...result,
        });
      }
      
      artistsProcessed++;
      
    } catch (e) {
      console.error(
        `Failed to process artist ${artist.name}, error: ${e.message}`
      );
    }
  }

  // Print summary statistics
  const totalStats = await getOrchestratorStats();
  console.log("\n=== Download Summary ===");
  console.log(`Total files downloaded: ${totalStats.totalTasksCompleted}`);
  console.log(`Total files failed: ${totalStats.totalTasksFailed}`);
  console.log(`Proxies used: ${totalStats.proxyCount}`);
  
  // Print per-proxy stats
  for (const [proxyId, stats] of Object.entries(totalStats.proxyStats)) {
    console.log(`${proxyId}: ${stats.successCount} ✓ ${stats.failureCount} ✗`);
  }
  
  // Check proxy health
  const health = await getProxyHealth();
  console.log("\n=== Proxy Health ===");
  for (const [proxyId, healthData] of Object.entries(health)) {
    console.log(`${proxyId}: ${healthData.status}`);
  }

  // Graceful shutdown
  await shutdownOrchestrator();
  
  // ... rest of existing code ...
}
```

---

## Integration Patterns

### Pattern 1: No Code Changes (Recommended for Most Users)

```javascript
// Use existing code exactly as-is
import { downloadFile } from "./lib/downloader-multi-proxy.js";
await downloadFile(attachment);
```

**Pros:**
- Zero code changes
- Minimal risk
- All proxy features available via `.env`

**Cons:**
- Can't access per-proxy statistics from code
- Can't use batch download optimization
- Limited advanced features

---

### Pattern 2: Gradual Migration (Safe for Large Codebases)

```javascript
// Keep existing loops, use new downloader
import { downloadFileWithProxy } from "./lib/downloader-multi-proxy.js";

// Replace in your loops
await downloadFileWithProxy(attachment);

// Use statistics when needed
import { getOrchestratorStats } from "./lib/downloader-multi-proxy.js";
const stats = await getOrchestratorStats();
```

**Pros:**
- Minimal code changes
- Can add new features incrementally
- Easy rollback if needed

**Cons:**
- Not using batch optimization
- Still have pLimit overhead in app.js

---

### Pattern 3: Full Integration (Maximum Performance)

```javascript
// Rewrite loops to use batch API
import { downloadPostBatchWithProxy } from "./lib/downloader-multi-proxy.js";

const result = await downloadPostBatchWithProxy(posts, processor);
```

**Pros:**
- Best performance
- Simplified code
- Full feature access

**Cons:**
- Largest code changes
- Need to refactor database integration
- More testing required

---

## Database Integration

When using batch downloads, you need to handle database records differently:

### Option A: Database Insert After Success (Current Approach)

```javascript
// Works with all patterns
for (const attachment of attachments) {
  await downloadFileWithProxy(attachment);
  
  // Record in database immediately
  await prisma.file.create({
    data: { /* ... */ }
  });
}
```

### Option B: Batch Insert After Download (Optimized)

```javascript
// Better for batch operations
const downloadResults = await downloadPostBatchWithProxy(posts, processor);

// Insert all records at once
const fileRecords = downloadResults.map(result => ({
  url: result.url,
  filename: result.filename,
  // ...
}));

await prisma.file.createMany({
  data: fileRecords,
  skipDuplicates: true, // Prevent duplicates
});
```

---

## Monitoring & Observability

### Adding Logging Integration

```javascript
import { getOrchestratorStats, getProxyHealth } from "./lib/downloader-multi-proxy.js";
import { logger } from "./lib/logger.js"; // Your existing logger

// Log statistics periodically
setInterval(async () => {
  const stats = await getOrchestratorStats();
  logger.info("Proxy Stats", {
    completed: stats.totalTasksCompleted,
    failed: stats.totalTasksFailed,
    proxies: stats.proxyCount,
    uptime: stats.uptime,
  });
  
  const health = await getProxyHealth();
  logger.info("Proxy Health", health);
}, 60000); // Every 60 seconds
```

### Adding Discord Notifications

```javascript
import { discord } from "./lib/discord.js";
import { getOrchestratorStats } from "./lib/downloader-multi-proxy.js";

// Notify about proxy issues
async function checkProxyHealth() {
  const stats = await getOrchestratorStats();
  
  const unhealthyProxies = Object.entries(stats.proxyStats)
    .filter(([_, stat]) => stat.failureCount > 5);
  
  if (unhealthyProxies.length > 0) {
    await discord.notify(
      `⚠️ Unhealthy proxies detected:\n${unhealthyProxies.map(([id]) => id).join(', ')}`
    );
  }
}

setInterval(checkProxyHealth, 300000); // Every 5 minutes
```

---

## Migration Checklist

If you want to fully migrate to the batch API:

- [ ] Review new batch download API in PROXY_SYSTEM.md
- [ ] Plan database integration changes
- [ ] Create test environment with all proxies
- [ ] Write unit tests for new code
- [ ] Implement database recording for batch results
- [ ] Test with production configuration
- [ ] Set up monitoring and alerting
- [ ] Deploy to staging first
- [ ] Monitor for 24 hours
- [ ] Deploy to production
- [ ] Keep old code as fallback for 1 week
- [ ] Monitor and optimize

---

## Rollback Plan

If issues arise after integration:

### Quick Rollback (Immediate)
```javascript
// Revert to legacy downloader
import { downloadFile } from "./lib/downloader.js";
await downloadFile(attachment);
```

### Full Rollback (Complete)
1. Revert `app.js` to original version
2. Comment out proxy configuration in `.env`
3. Restart the application
4. System returns to original behavior

---

## Performance Tips

### Tip 1: Let Redis Handle Coordination
Don't add additional locking mechanisms - the TaskQueue handles everything:

```javascript
// ✅ Good - Let orchestrator handle it
await downloadFileWithProxy(attachment);

// ❌ Bad - Adding extra locks
const lock = await acquireCustomLock();
await downloadFileWithProxy(attachment);
await releaseCustomLock();
```

### Tip 2: Use Batch Processing When Possible
```javascript
// ✅ Efficient
await downloadPostBatchWithProxy(100Posts, processor);

// ❌ Less efficient (100 separate calls)
for (const post of posts) {
  await downloadFileWithProxy(attachment);
}
```

### Tip 3: Monitor, Don't Micro-Manage
```javascript
// ✅ Good - Let proxy selector choose
const downloader = orchestrator.selectProxyDownloader();

// ❌ Bad - Manual proxy selection
const downloader = orchestrator.downloaders[0]; // Always first
```

### Tip 4: Batch Database Operations
```javascript
// ✅ Efficient
const results = await downloadPostBatchWithProxy(posts, processor);
await prisma.file.createMany({ data: results });

// ❌ Slow (individual inserts)
for (const result of results) {
  await prisma.file.create({ data: result });
}
```

---

## Troubleshooting Integration Issues

### Issue: "Too many open file handles"

**Cause:** Connection pool not being properly reused

**Solution:**
```bash
# Reduce concurrency
PROXY_POST_LIMIT=1
PROXY_ATTACHMENT_LIMIT=2

# Or limit total proxies
PROXY_LIST=[{"isLocalhost":true}]
```

### Issue: Database constraint violations

**Cause:** Duplicate records from concurrent inserts

**Solution:**
```javascript
// Use database constraints and skip duplicates
await prisma.file.createMany({
  data: fileRecords,
  skipDuplicates: true,
});
```

### Issue: Redis connection pool exhaustion

**Cause:** Too many simultaneous Redis operations

**Solution:**
```bash
# Increase Redis max clients
# In Redis configuration: maxclients 20000

# Or reduce proxy concurrency
PROXY_ATTACHMENT_LIMIT=2
```

---

## Keeping Backward Compatibility

Always import from the new module:

```javascript
// ✅ Good - Works with both old and new features
import { downloadFile } from "./lib/downloader-multi-proxy.js";

// ❌ Don't use old module - bypasses proxy system
import { downloadFile } from "./lib/downloader.js";
```

The new module includes the legacy function with full backward compatibility.

---

## Next Steps

1. **No Integration Needed?** You're done - the system works automatically
2. **Want Statistics?** Use `getOrchestratorStats()` in your monitoring code
3. **Want Better Performance?** Refactor to use batch API
4. **Want Full Optimization?** Complete rewrite following Pattern 3

Choose what works best for your use case!
