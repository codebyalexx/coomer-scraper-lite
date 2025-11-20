/**
 * Proxy Orchestrator
 *
 * Central coordinator for multi-proxy download system:
 * - Manages all proxy downloader instances
 * - Distributes tasks across proxies using load balancing
 * - Handles proxy failure and recovery
 * - Tracks proxy health and availability
 * - Provides unified interface for batch downloads
 */

import { ProxyDownloader } from "./proxy-downloader.js";
import { TaskQueue } from "./task-queue.js";
import {
  getProxiesConfig,
  validateProxyConfig,
  getProxyId,
  getConcurrencyConfig,
} from "./proxy-config.js";

/**
 * Proxy Health Status
 */
const PROXY_STATUS = {
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  UNHEALTHY: "unhealthy",
};

/**
 * Task Distribution Strategies
 */
const DISTRIBUTION_STRATEGY = {
  ROUND_ROBIN: "round-robin",
  LOAD_BALANCED: "load-balanced",
  FIRST_AVAILABLE: "first-available",
};

/**
 * ProxyOrchestrator - Central coordination for multi-proxy downloads
 */
export class ProxyOrchestrator {
  /**
   * Initialize the proxy orchestrator
   *
   * @param {Object} options - Configuration options
   * @param {string} options.strategy - Task distribution strategy
   * @param {Object} options.logger - Logger instance
   */
  constructor(options = {}) {
    this.proxies = [];
    this.downloaders = [];
    this.taskQueue = new TaskQueue();
    this.proxyHealth = new Map();

    this.strategy = options.strategy || DISTRIBUTION_STRATEGY.LOAD_BALANCED;
    this.logger = options.logger || console;

    this.roundRobinIndex = 0;
    this.isInitialized = false;

    this.orchStats = {
      totalTasksAssigned: 0,
      totalTasksCompleted: 0,
      totalTasksFailed: 0,
      startTime: Date.now(),
    };
  }

  /**
   * Initialize orchestrator with proxy configurations
   */
  async initialize() {
    if (this.isInitialized) {
      this.log("info", "Orchestrator already initialized");
      return;
    }

    try {
      // Load proxy configurations
      const proxiesConfig = getProxiesConfig();

      if (!Array.isArray(proxiesConfig) || proxiesConfig.length === 0) {
        throw new Error("No proxies configured");
      }

      // Validate and create downloader for each proxy
      for (const proxy of proxiesConfig) {
        if (!validateProxyConfig(proxy)) {
          this.log("warn", `Skipping invalid proxy configuration: ${JSON.stringify(proxy)}`);
          continue;
        }

        const proxyId = getProxyId(proxy);

        // Create downloader for this proxy
        const downloader = new ProxyDownloader(
          proxyId,
          proxy,
          this.taskQueue,
          { logger: this.logger }
        );

        this.proxies.push(proxy);
        this.downloaders.push(downloader);
        this.proxyHealth.set(proxyId, {
          status: PROXY_STATUS.HEALTHY,
          failureCount: 0,
          lastFailure: null,
          createdAt: Date.now(),
        });

        this.log("info", `Initialized proxy downloader: ${proxyId}`);
      }

      if (this.downloaders.length === 0) {
        throw new Error("No valid proxy downloaders initialized");
      }

      this.isInitialized = true;
      this.log("info", `Proxy orchestrator initialized with ${this.downloaders.length} downloader(s)`);

    } catch (error) {
      this.log("error", `Failed to initialize orchestrator: ${error.message}`);
      throw error;
    }
  }

  /**
   * Log message with orchestrator prefix
   */
  log(level, message) {
    const prefix = "[ProxyOrchestrator]";
    if (this.logger[level]) {
      this.logger[level](`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }

  /**
   * Select next proxy for task assignment based on strategy
   *
   * @returns {ProxyDownloader|null} Selected downloader or null if none available
   */
  selectProxyDownloader() {
    const healthyDownloaders = this.downloaders.filter(d => {
      const health = this.proxyHealth.get(d.proxyId);
      return health && health.status === PROXY_STATUS.HEALTHY;
    });

    if (healthyDownloaders.length === 0) {
      this.log("warn", "No healthy proxies available, using all proxies");
      return this.selectNextProxyByStrategy(this.downloaders);
    }

    return this.selectNextProxyByStrategy(healthyDownloaders);
  }

  /**
   * Select proxy based on configured strategy
   *
   * @param {Array<ProxyDownloader>} candidates - Candidate downloaders
   * @returns {ProxyDownloader|null}
   */
  selectNextProxyByStrategy(candidates) {
    if (!candidates || candidates.length === 0) {
      return null;
    }

    switch (this.strategy) {
      case DISTRIBUTION_STRATEGY.ROUND_ROBIN:
        return this.selectRoundRobin(candidates);

      case DISTRIBUTION_STRATEGY.LOAD_BALANCED:
        return this.selectLoadBalanced(candidates);

      case DISTRIBUTION_STRATEGY.FIRST_AVAILABLE:
      default:
        return candidates[0];
    }
  }

  /**
   * Round-robin proxy selection
   */
  selectRoundRobin(candidates) {
    const selected = candidates[this.roundRobinIndex % candidates.length];
    this.roundRobinIndex++;
    return selected;
  }

  /**
   * Select proxy with lowest active task count
   */
  selectLoadBalanced(candidates) {
    return candidates.reduce((prev, curr) => {
      const prevPending =
        (prev.postLimit.pendingCount || 0) +
        (prev.attachmentLimit.pendingCount || 0);
      const currPending =
        (curr.postLimit.pendingCount || 0) +
        (curr.attachmentLimit.pendingCount || 0);

      return currPending < prevPending ? curr : prev;
    });
  }

  /**
   * Record proxy failure and update health status
   *
   * @param {string} proxyId - Proxy identifier
   * @param {Error} error - Error that occurred
   */
  recordProxyFailure(proxyId, error) {
    const health = this.proxyHealth.get(proxyId);
    if (!health) return;

    health.failureCount++;
    health.lastFailure = {
      timestamp: Date.now(),
      error: error.message,
    };

    // Update status based on failure count
    if (health.failureCount >= 3) {
      health.status = PROXY_STATUS.UNHEALTHY;
      this.log("error", `Proxy marked unhealthy: ${proxyId} (${health.failureCount} failures)`);
    } else if (health.failureCount >= 1) {
      health.status = PROXY_STATUS.DEGRADED;
      this.log("warn", `Proxy degraded: ${proxyId} (${health.failureCount} failures)`);
    }
  }

  /**
   * Attempt to recover an unhealthy proxy
   *
   * @param {string} proxyId - Proxy identifier
   */
  attemptProxyRecovery(proxyId) {
    const health = this.proxyHealth.get(proxyId);
    if (!health) return;

    const timeSinceFailure = Date.now() - (health.lastFailure?.timestamp || 0);
    const recoveryDelay = 5 * 60 * 1000; // 5 minutes

    if (timeSinceFailure > recoveryDelay) {
      health.status = PROXY_STATUS.HEALTHY;
      health.failureCount = 0;
      this.log("info", `Proxy recovered: ${proxyId}`);
    }
  }

  /**
   * Download posts with attachments using proxy pool
   * Main entry point for batch downloads
   *
   * @param {Array<Object>} posts - Posts to download
   * @param {Function} postProcessor - Async function to process post (prepare attachments)
   * @returns {Promise<Object>} Download statistics
   */
  async downloadPostBatch(posts, postProcessor) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.downloaders.length === 0) {
      throw new Error("No proxy downloaders available");
    }

    const batchStartTime = Date.now();
    const batchStats = {
      totalPosts: posts.length,
      processedPosts: 0,
      totalFiles: 0,
      successFiles: 0,
      failedFiles: 0,
      proxyStats: {},
      duration: 0,
    };

    // Process posts with post-level concurrency across proxies
    const postTasks = posts.map(async (post) => {
      try {
        // Get attachment for this post
        const attachments = await postProcessor(post);

        if (!attachments || attachments.length === 0) {
          batchStats.processedPosts++;
          return;
        }

        // Add tasks to queue
        for (const attachment of attachments) {
          const task = await this.taskQueue.addTask(attachment);
          if (task) {
            this.orchStats.totalTasksAssigned++;
          }
        }

        // Process attachments through proxies
        const results = await this.processTaskQueueForPost(attachments);

        batchStats.processedPosts++;
        batchStats.totalFiles += attachments.length;
        results.forEach(result => {
          if (result.success) {
            batchStats.successFiles++;
          } else {
            batchStats.failedFiles++;
          }
        });

      } catch (error) {
        this.log("error", `Failed to process post: ${error.message}`);
      }
    });

    // Use max concurrency across all proxies for post processing
    const concurrencyConfig = getConcurrencyConfig();
    const maxConcurrentPosts = concurrencyConfig.postLimit * this.downloaders.length;

    // Process posts with global concurrency limit
    const results = [];
    for (let i = 0; i < postTasks.length; i += maxConcurrentPosts) {
      const batch = postTasks.slice(i, i + maxConcurrentPosts);
      await Promise.allSettled(batch);
    }

    // Collect statistics from all downloaders
    for (const downloader of this.downloaders) {
      const stats = downloader.getStats();
      batchStats.proxyStats[stats.proxyId] = stats;
      this.orchStats.totalTasksCompleted += stats.successCount;
      this.orchStats.totalTasksFailed += stats.failureCount;
    }

    batchStats.duration = Date.now() - batchStartTime;

    this.log("info", `Batch download completed: ${batchStats.successFiles}/${batchStats.totalFiles} files, ${batchStats.duration}ms`);

    return batchStats;
  }

  /**
   * Process task queue for a single post's attachments
   * Distributes attachments across proxies
   *
   * @param {Array<Object>} attachments - Attachments to download
   * @returns {Promise<Array>} Results from all proxies
   */
  async processTaskQueueForPost(attachments) {
    const results = [];

    for (const attachment of attachments) {
      try {
        // Select proxy for this attachment
        const downloader = this.selectProxyDownloader();
        if (!downloader) {
          results.push({
            success: false,
            error: "No available proxies",
          });
          continue;
        }

        // Download file through selected proxy
        const result = await downloader.downloadFile(attachment);
        results.push({ success: true, ...result });

      } catch (error) {
        results.push({
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Get orchestrator statistics
   */
  getStats() {
    const proxyStats = {};

    for (const downloader of this.downloaders) {
      const stats = downloader.getStats();
      proxyStats[stats.proxyId] = stats;
    }

    return {
      ...this.orchStats,
      proxyCount: this.downloaders.length,
      strategy: this.strategy,
      queueSize: this.taskQueue.getQueueSize(),
      proxyStats,
      uptime: Date.now() - this.orchStats.startTime,
    };
  }

  /**
   * Get health status of all proxies
   */
  getProxyHealth() {
    const health = {};

    for (const [proxyId, healthData] of this.proxyHealth) {
      health[proxyId] = {
        ...healthData,
        downloader: this.downloaders.find(d => d.proxyId === proxyId)?.getStats(),
      };
    }

    return health;
  }

  /**
   * Shutdown orchestrator and cleanup resources
   */
  async shutdown() {
    this.log("info", "Shutting down proxy orchestrator");

    // Clear task queue
    this.taskQueue.clearQueue();

    // Reset downloader stats
    for (const downloader of this.downloaders) {
      downloader.resetStats();
    }

    this.isInitialized = false;
    this.log("info", "Proxy orchestrator shutdown complete");
  }
}

export default ProxyOrchestrator;
