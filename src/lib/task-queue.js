/**
 * Task Queue with Redis-Based Coordination
 *
 * Manages download task distribution with:
 * - Redis-based deduplication (prevents duplicate downloads across all proxies)
 * - File-level locking (ensures only one proxy downloads a file at a time)
 * - Task lifecycle tracking (pending, in-progress, completed, failed)
 */

import redisClient from "./redis.js";

const QUEUE_PREFIX = "task-queue";
const LOCK_PREFIX = "task-lock";
const IN_PROGRESS_PREFIX = "task-in-progress";
const COMPLETED_PREFIX = "task-completed";

// Task state constants
export const TASK_STATE = {
  PENDING: "pending",
  IN_PROGRESS: "in-progress",
  COMPLETED: "completed",
  FAILED: "failed",
};

/**
 * Task representation
 */
class Task {
  constructor(id, attachment, metadata = {}) {
    this.id = id; // Unique task identifier (usually file path)
    this.attachment = attachment; // File attachment object
    this.metadata = metadata; // Additional task metadata
    this.createdAt = Date.now();
    this.attempts = 0;
    this.state = TASK_STATE.PENDING;
  }
}

/**
 * TaskQueue - Centralized task management with Redis coordination
 */
export class TaskQueue {
  /**
   * Initialize task queue
   *
   * @param {Object} options - Configuration options
   * @param {number} options.lockTTL - Lock expiration time in seconds (default: 3600)
   * @param {number} options.taskTTL - Task record retention time in seconds (default: 86400)
   */
  constructor(options = {}) {
    this.lockTTL = options.lockTTL || 3600; // 1 hour default
    this.taskTTL = options.taskTTL || 86400; // 24 hours default
    this.localQueue = []; // In-memory queue for fast access
  }

  /**
   * Generate unique task ID
   */
  generateTaskId(attachment) {
    return attachment.outputFilePath;
  }

  /**
   * Add task to queue
   * Ensures deduplication: if task exists, it's not re-queued
   *
   * @param {Object} attachment - File attachment to download
   * @returns {Promise<Task>} Task object
   */
  async addTask(attachment) {
    const taskId = this.generateTaskId(attachment);

    // Check if task already exists in Redis
    const existingState = await redisClient.get(`${COMPLETED_PREFIX}:${taskId}`);
    if (existingState) {
      // Task already completed
      return null;
    }

    // Create task if doesn't exist
    const task = new Task(taskId, attachment);
    this.localQueue.push(task);

    return task;
  }

  /**
   * Attempt to acquire lock on a file
   * Only one proxy can hold a lock at a time
   *
   * @param {string} taskId - Task identifier (file path)
   * @param {string} proxyId - Proxy identifier acquiring the lock
   * @returns {Promise<boolean>} True if lock acquired, false if already locked
   */
  async acquireLock(taskId, proxyId) {
    const lockKey = `${LOCK_PREFIX}:${taskId}`;
    const lockValue = `${proxyId}:${Date.now()}`;

    // Set lock only if it doesn't exist (atomic operation)
    const result = await redisClient.set(lockKey, lockValue, {
      NX: true, // Only set if key doesn't exist
      EX: this.lockTTL, // Expiration time
    });

    return result === "OK";
  }

  /**
   * Release lock on a file
   *
   * @param {string} taskId - Task identifier
   * @param {string} proxyId - Proxy identifier (for verification)
   * @returns {Promise<boolean>} True if lock released
   */
  async releaseLock(taskId, proxyId) {
    const lockKey = `${LOCK_PREFIX}:${taskId}`;
    const lockValue = await redisClient.get(lockKey);

    // Only release if lock is held by this proxy
    if (lockValue && lockValue.startsWith(proxyId)) {
      await redisClient.del(lockKey);
      return true;
    }

    return false;
  }

  /**
   * Mark task as in-progress
   *
   * @param {string} taskId - Task identifier
   * @param {string} proxyId - Proxy handling this task
   * @returns {Promise<void>}
   */
  async markInProgress(taskId, proxyId) {
    const key = `${IN_PROGRESS_PREFIX}:${taskId}`;
    await redisClient.set(key, proxyId, { EX: this.lockTTL });
  }

  /**
   * Mark task as completed
   * Prevents future reprocessing by any proxy
   *
   * @param {string} taskId - Task identifier
   * @param {Object} metadata - Completion metadata
   * @returns {Promise<void>}
   */
  async markCompleted(taskId, metadata = {}) {
    const key = `${COMPLETED_PREFIX}:${taskId}`;
    const value = JSON.stringify({
      completedAt: Date.now(),
      ...metadata,
    });

    await redisClient.set(key, value, { EX: this.taskTTL });

    // Remove from in-progress tracking
    await redisClient.del(`${IN_PROGRESS_PREFIX}:${taskId}`);

    // Remove lock
    await redisClient.del(`${LOCK_PREFIX}:${taskId}`);

    // Remove from local queue
    this.localQueue = this.localQueue.filter(t => t.id !== taskId);
  }

  /**
   * Mark task as failed
   *
   * @param {string} taskId - Task identifier
   * @param {string} error - Error message
   * @param {string} proxyId - Proxy that failed
   * @returns {Promise<void>}
   */
  async markFailed(taskId, error, proxyId) {
    const failedKey = `task-failed:${taskId}`;
    const failureRecord = {
      failedAt: Date.now(),
      proxyId,
      error,
      timestamp: new Date().toISOString(),
    };

    // Store failure record
    await redisClient.set(failedKey, JSON.stringify(failureRecord), {
      EX: this.taskTTL,
    });

    // Release lock on failure
    await this.releaseLock(taskId, proxyId);

    // Remove from in-progress
    await redisClient.del(`${IN_PROGRESS_PREFIX}:${taskId}`);
  }

  /**
   * Check if task is already completed
   *
   * @param {string} taskId - Task identifier
   * @returns {Promise<boolean>} True if task is completed
   */
  async isCompleted(taskId) {
    const key = `${COMPLETED_PREFIX}:${taskId}`;
    const result = await redisClient.get(key);
    return result !== null;
  }

  /**
   * Check if task is currently being processed
   *
   * @param {string} taskId - Task identifier
   * @returns {Promise<string|null>} Proxy ID if in progress, null otherwise
   */
  async getInProgressProxy(taskId) {
    const key = `${IN_PROGRESS_PREFIX}:${taskId}`;
    return await redisClient.get(key);
  }

  /**
   * Get next available task for a proxy
   * Returns next pending task from local queue
   *
   * @returns {Task|null} Next task or null if queue empty
   */
  getNextTask() {
    return this.localQueue.shift() || null;
  }

  /**
   * Get queue size
   *
   * @returns {number} Number of pending tasks
   */
  getQueueSize() {
    return this.localQueue.length;
  }

  /**
   * Clear local queue
   */
  clearQueue() {
    this.localQueue = [];
  }
}

export default TaskQueue;
