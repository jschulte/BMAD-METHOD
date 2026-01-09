/**
 * Gate Manager - Two-Gate Publish Model for PRD/Epic Crowdsourcing
 *
 * Implements the two-gate publish model:
 * - Gate 0: Local drafting (no GitHub interaction)
 * - Gate 1: Publish for review (creates GitHub Review Issues)
 * - Gate 2: Ship stories (creates GitHub Story Issues as dev-ready)
 *
 * ## Integration Contract
 *
 * This class is designed for use within BMAD workflow instructions, where
 * GitHub operations are executed via MCP tools. The private methods
 * (_createIssue, _closeIssue, _updateIssue, _addComment) throw errors to
 * indicate they must be implemented by the workflow runtime.
 *
 * When used in workflow instructions, these calls are replaced with:
 * - _createIssue → mcp__github__issue_write({ method: 'create', ... })
 * - _closeIssue → mcp__github__issue_write({ method: 'update', state: 'closed', ... })
 * - _updateIssue → mcp__github__issue_write({ method: 'update', ... })
 * - _addComment → mcp__github__add_issue_comment({ ... })
 *
 * For standalone usage, extend this class and override the private methods
 * with your GitHub API client of choice.
 */

/**
 * Document statuses used in the gate system
 */
const DOCUMENT_STATUS = {
  // Gate 0 - Local only
  draft: 'draft',

  // Gate 1 - Published for review
  published: 'published',
  feedback: 'feedback',
  synthesis: 'synthesis',
  signoff: 'signoff',
  approved: 'approved',

  // Special statuses
  blocked: 'blocked',
  revision: 'revision',
};

/**
 * Story statuses for Gate 2
 */
const STORY_STATUS = {
  draft: 'draft',
  ready_for_dev: 'ready-for-dev',
  in_progress: 'in-progress',
  in_review: 'in-review',
  done: 'done',
  blocked: 'blocked',
  recalled: 'recalled',
  do_not_develop: 'do-not-develop',
};

/**
 * Valid status transitions for documents
 */
const VALID_TRANSITIONS = {
  // PRD/Epic transitions
  draft: ['published'],
  published: ['feedback'],
  feedback: ['synthesis', 'signoff'],
  synthesis: ['feedback', 'signoff'],
  signoff: ['approved', 'blocked', 'feedback'],
  approved: ['revision'],
  blocked: ['feedback', 'revision'],
  revision: ['feedback', 'signoff'],

  // Story transitions (Gate 2)
  story_draft: ['ready_for_dev'],
  ready_for_dev: ['in_progress', 'recalled', 'do_not_develop'],
  in_progress: ['in_review', 'blocked', 'ready_for_dev'],
  in_review: ['done', 'in_progress'],
  done: [],
  recalled: ['ready_for_dev'],
  do_not_develop: ['ready_for_dev'],
};

/**
 * Gate definitions
 */
const GATES = {
  REVIEW: 1, // Gate 1: Publish for stakeholder review
  DEV: 2, // Gate 2: Ship for development
};

class GateManager {
  /**
   * Create a new GateManager
   * @param {Object} config - Configuration object
   * @param {Object} config.cacheManager - CacheManager instance for local storage
   * @param {string} config.owner - GitHub repository owner
   * @param {string} config.repo - GitHub repository name
   */
  constructor(config) {
    this.cacheManager = config.cacheManager;
    this.owner = config.owner;
    this.repo = config.repo;
  }

  // ============ Gate 1: Publish for Review ============

  /**
   * Validate that a document can be published for review (Gate 1)
   * @param {string} documentType - 'prd' or 'epic'
   * @param {string} documentKey - Document identifier
   * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
   */
  validateForReview(documentType, documentKey) {
    const errors = [];
    const warnings = [];

    // Check document exists in cache
    const document =
      documentType === 'prd'
        ? this.cacheManager.readPrd(documentKey, { ignoreStale: true })
        : this.cacheManager.readEpic(documentKey, { ignoreStale: true });

    if (!document) {
      errors.push(`${documentType.toUpperCase()} '${documentKey}' not found in local cache. Create it first.`);
      return { valid: false, errors, warnings };
    }

    // Check document status allows publishing
    const validStatuses = new Set(['draft', 'revision', 'blocked']);
    if (!validStatuses.has(document.meta?.status)) {
      errors.push(
        `${documentType.toUpperCase()} '${documentKey}' is in status '${document.meta?.status}'. ` +
          `Can only publish documents in draft, revision, or blocked status.`,
      );
    }

    // Check required fields
    if (!document.content || document.content.trim().length === 0) {
      errors.push(`${documentType.toUpperCase()} '${documentKey}' has no content.`);
    }

    // Check stakeholders
    if (!document.meta?.stakeholders || document.meta.stakeholders.length === 0) {
      warnings.push(`No stakeholders defined for ${documentType}:${documentKey}. Consider adding reviewers.`);
    }

    // For epics, check if source PRD is approved
    if (documentType === 'epic' && document.meta?.prd_key) {
      const prd = this.cacheManager.readPrd(document.meta.prd_key, { ignoreStale: true });
      if (prd && prd.meta?.status !== 'approved') {
        warnings.push(`Source PRD '${document.meta.prd_key}' is not approved (status: ${prd.meta?.status}).`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Publish a document for review (Gate 1)
   * @param {Object} params - Publish parameters
   * @param {string} params.documentType - 'prd' or 'epic'
   * @param {string} params.documentKey - Document identifier
   * @param {string} params.title - Document title
   * @param {string[]} params.stakeholders - Array of GitHub usernames
   * @param {string} params.deadline - Feedback deadline (ISO date)
   * @returns {Object} { success, reviewIssueNumber, errors, warnings }
   */
  async publishForReview({ documentType, documentKey, title, stakeholders, deadline }) {
    // Validate first
    const validation = this.validateForReview(documentType, documentKey);
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors,
        warnings: validation.warnings,
      };
    }

    // Get current version
    const document =
      documentType === 'prd'
        ? this.cacheManager.readPrd(documentKey, { ignoreStale: true })
        : this.cacheManager.readEpic(documentKey, { ignoreStale: true });

    const version = document.meta?.version || 1;

    // Build review issue body
    const body = this._buildReviewIssueBody({
      documentType,
      documentKey,
      title,
      version,
      stakeholders,
      deadline,
      content: document.content,
    });

    // Build labels
    const labels = [`type:${documentType}-review`, `${documentType}:${documentKey}`, `version:${version}`, 'review-status:open'];

    // Create GitHub Review Issue
    const issue = await this._createIssue({
      title: `${documentType.toUpperCase()} Review: ${title} v${version}`,
      body,
      labels,
    });

    // Update cache with review issue number
    if (documentType === 'prd') {
      this.cacheManager.writePrd(documentKey, document.content, {
        ...document.meta,
        review_issue: issue.number,
        status: 'published',
        stakeholders: stakeholders || document.meta?.stakeholders,
        feedback_deadline: deadline,
      });
    } else {
      this.cacheManager.writeEpic(documentKey, document.content, {
        ...document.meta,
        review_issue: issue.number,
        status: 'published',
        stakeholders: stakeholders || document.meta?.stakeholders,
        feedback_deadline: deadline,
      });
    }

    return {
      success: true,
      reviewIssueNumber: issue.number,
      documentKey,
      documentType,
      version,
      warnings: validation.warnings,
    };
  }

  // ============ Gate 2: Ship Stories ============

  /**
   * Validate that stories can be shipped for development (Gate 2)
   * @param {string} epicKey - Epic identifier
   * @param {Object} options - Options
   * @param {boolean} options.force - Skip epic approval check
   * @param {string[]} options.storyKeys - Specific stories to ship (optional, defaults to all)
   * @returns {Object} { valid, errors, warnings, stories }
   */
  validateForShipping(epicKey, options = {}) {
    const errors = [];
    const warnings = [];
    const storiesToShip = [];

    // Check epic exists
    const epic = this.cacheManager.readEpic(epicKey, { ignoreStale: true });
    if (!epic) {
      errors.push(`Epic '${epicKey}' not found in local cache.`);
      return { valid: false, errors, warnings, stories: [] };
    }

    // Check epic approval status (unless force flag)
    if (!options.force && epic.meta?.status !== 'approved') {
      errors.push(
        `Epic '${epicKey}' is not approved (status: ${epic.meta?.status}). ` +
          `Use --force to ship anyway, but stories may change after approval.`,
      );
    } else if (options.force && epic.meta?.status !== 'approved') {
      warnings.push(`Epic '${epicKey}' is not approved (status: ${epic.meta?.status}). ` + `Shipping unapproved stories.`);
    }

    // Get stories to ship
    const storyKeys = options.storyKeys || epic.meta?.stories || [];

    if (storyKeys.length === 0) {
      errors.push(`No stories found for epic '${epicKey}'. Generate stories first.`);
      return { valid: errors.length === 0, errors, warnings, stories: [] };
    }

    // Validate each story
    for (const storyKey of storyKeys) {
      const story = this.cacheManager.readStory(storyKey, { ignoreStale: true });

      if (!story) {
        errors.push(`Story '${storyKey}' not found in local cache.`);
        continue;
      }

      // Check story isn't already shipped
      if (story.meta?.github_issue) {
        warnings.push(`Story '${storyKey}' already has GitHub Issue #${story.meta.github_issue}. Skipping.`);
        continue;
      }

      // Check story has content
      if (!story.content || story.content.trim().length === 0) {
        errors.push(`Story '${storyKey}' has no content.`);
        continue;
      }

      storiesToShip.push({
        storyKey,
        content: story.content,
        meta: story.meta,
      });
    }

    if (storiesToShip.length === 0 && errors.length === 0) {
      warnings.push(`All stories for epic '${epicKey}' are already shipped or invalid.`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stories: storiesToShip,
    };
  }

  /**
   * Ship stories for development (Gate 2)
   * @param {Object} params - Ship parameters
   * @param {string} params.epicKey - Epic identifier
   * @param {string} params.prdKey - Source PRD key (for traceability)
   * @param {Object} params.options - Options (force, storyKeys)
   * @returns {Object} { success, shippedStories, errors, warnings }
   */
  async shipStories({ epicKey, prdKey, options = {} }) {
    // Validate first
    const validation = this.validateForShipping(epicKey, options);

    // For non-force mode, validation errors are blocking
    if (!validation.valid && !options.force) {
      return {
        success: false,
        shippedStories: [],
        errors: validation.errors,
        warnings: validation.warnings,
      };
    }

    const shippedStories = [];
    const shipErrors = [];

    // Ship each valid story
    for (const storyInfo of validation.stories) {
      try {
        const result = await this._shipSingleStory({
          storyKey: storyInfo.storyKey,
          content: storyInfo.content,
          meta: storyInfo.meta,
          epicKey,
          prdKey,
        });

        shippedStories.push(result);
      } catch (error) {
        shipErrors.push(`Failed to ship story '${storyInfo.storyKey}': ${error.message}`);
      }
    }

    return {
      success: shippedStories.length > 0,
      shippedStories,
      errors: [...validation.errors, ...shipErrors],
      warnings: validation.warnings,
    };
  }

  /**
   * Ship a single story to GitHub
   * @private
   */
  async _shipSingleStory({ storyKey, content, meta, epicKey, prdKey }) {
    // Parse story title from content
    const titleMatch = content.match(/^#\s*(.+?)(?:\n|$)/m);
    const title = titleMatch ? titleMatch[1].trim() : storyKey;

    // Build labels
    const labels = ['type:story', `epic:${epicKey}`, 'status:ready-for-dev'];

    if (prdKey) {
      labels.push(`prd:${prdKey}`);
    }

    // Create GitHub Issue
    const issue = await this._createIssue({
      title: `[Story] ${title}`,
      body: content,
      labels,
    });

    // Update cache with GitHub issue number
    this.cacheManager.writeStory(storyKey, content, {
      ...meta,
      github_issue: issue.number,
      status: STORY_STATUS.ready_for_dev,
      shipped_at: new Date().toISOString(),
    });

    return {
      storyKey,
      issueNumber: issue.number,
      title,
      status: STORY_STATUS.ready_for_dev,
    };
  }

  // ============ Recall Stories ============

  /**
   * Recall shipped stories (close GitHub Issues)
   * @param {Object} params - Recall parameters
   * @param {string} params.epicKey - Epic identifier (optional, recall all stories for epic)
   * @param {string[]} params.storyKeys - Specific stories to recall
   * @param {string} params.reason - Reason for recall
   * @returns {Object} { success, recalledStories, errors }
   */
  async recallStories({ epicKey, storyKeys, reason }) {
    const errors = [];
    const recalledStories = [];

    // Determine which stories to recall
    let keysToRecall = storyKeys || [];

    if (epicKey && !storyKeys) {
      const epic = this.cacheManager.readEpic(epicKey, { ignoreStale: true });
      if (epic?.meta?.stories) {
        keysToRecall = epic.meta.stories;
      }
    }

    if (keysToRecall.length === 0) {
      errors.push('No stories specified for recall.');
      return { success: false, recalledStories, errors };
    }

    // Recall each story
    for (const storyKey of keysToRecall) {
      try {
        const story = this.cacheManager.readStory(storyKey, { ignoreStale: true });

        if (!story) {
          errors.push(`Story '${storyKey}' not found in cache.`);
          continue;
        }

        if (!story.meta?.github_issue) {
          errors.push(`Story '${storyKey}' has no GitHub Issue to recall.`);
          continue;
        }

        // Close the GitHub Issue
        await this._closeIssue(story.meta.github_issue, {
          reason: 'not_planned',
          comment: `Story recalled: ${reason || 'Scope change'}`,
          labels_to_add: ['status:recalled'],
          labels_to_remove: ['status:ready-for-dev', 'status:in-progress'],
        });

        // Update cache
        this.cacheManager.writeStory(storyKey, story.content, {
          ...story.meta,
          status: STORY_STATUS.recalled,
          recalled_at: new Date().toISOString(),
          recall_reason: reason,
        });

        recalledStories.push({
          storyKey,
          issueNumber: story.meta.github_issue,
          reason,
        });
      } catch (error) {
        errors.push(`Failed to recall story '${storyKey}': ${error.message}`);
      }
    }

    return {
      success: recalledStories.length > 0,
      recalledStories,
      errors,
    };
  }

  // ============ Status Transitions ============

  /**
   * Check if a status transition is valid
   * @param {string} currentStatus - Current document status
   * @param {string} newStatus - Proposed new status
   * @returns {boolean} True if transition is valid
   */
  isValidTransition(currentStatus, newStatus) {
    const validNextStatuses = VALID_TRANSITIONS[currentStatus] || [];
    return validNextStatuses.includes(newStatus);
  }

  /**
   * Get valid next statuses for a document
   * @param {string} currentStatus - Current status
   * @returns {string[]} Array of valid next statuses
   */
  getValidNextStatuses(currentStatus) {
    return VALID_TRANSITIONS[currentStatus] || [];
  }

  // ============ Query Methods ============

  /**
   * Get documents ready for Gate 1 (publish for review)
   * @returns {Object} { prds: [], epics: [] }
   */
  getDocumentsReadyForReview() {
    const prdKeys = this.cacheManager.listCachedPrds();
    const epicKeys = this.cacheManager.listCachedEpics();

    const validStatuses = new Set(['draft', 'revision', 'blocked']);

    const prds = prdKeys
      .map((key) => {
        const prd = this.cacheManager.readPrd(key, { ignoreStale: true });
        return { key, meta: prd?.meta };
      })
      .filter((p) => validStatuses.has(p.meta?.status));

    const epics = epicKeys
      .map((key) => {
        const epic = this.cacheManager.readEpic(key, { ignoreStale: true });
        return { key, meta: epic?.meta };
      })
      .filter((e) => validStatuses.has(e.meta?.status));

    return { prds, epics };
  }

  /**
   * Get epics ready for Gate 2 (ship stories)
   * @returns {Object[]} Array of { epicKey, meta, storyCount }
   */
  getEpicsReadyForShipping() {
    const epicKeys = this.cacheManager.listCachedEpics();

    return epicKeys
      .map((key) => {
        const epic = this.cacheManager.readEpic(key, { ignoreStale: true });
        const storyCount = epic?.meta?.stories?.length || 0;
        const unshippedCount =
          epic?.meta?.stories?.filter((sk) => {
            const story = this.cacheManager.readStory(sk, { ignoreStale: true });
            return story && !story.meta?.github_issue;
          }).length || 0;

        return {
          epicKey: key,
          meta: epic?.meta,
          storyCount,
          unshippedCount,
        };
      })
      .filter((e) => e.meta?.status === 'approved' && e.unshippedCount > 0);
  }

  /**
   * Get gate status summary
   * @returns {Object} Summary of documents at each gate
   */
  getGateSummary() {
    const readyForReview = this.getDocumentsReadyForReview();
    const readyForShipping = this.getEpicsReadyForShipping();

    const prdsByStatus = {};
    for (const key of this.cacheManager.listCachedPrds()) {
      const prd = this.cacheManager.readPrd(key, { ignoreStale: true });
      const status = prd?.meta?.status || 'unknown';
      prdsByStatus[status] = (prdsByStatus[status] || 0) + 1;
    }

    const epicsByStatus = {};
    for (const key of this.cacheManager.listCachedEpics()) {
      const epic = this.cacheManager.readEpic(key, { ignoreStale: true });
      const status = epic?.meta?.status || 'unknown';
      epicsByStatus[status] = (epicsByStatus[status] || 0) + 1;
    }

    return {
      gate1_ready: {
        prds: readyForReview.prds.length,
        epics: readyForReview.epics.length,
      },
      gate2_ready: {
        epics: readyForShipping.length,
        total_unshipped_stories: readyForShipping.reduce((sum, e) => sum + e.unshippedCount, 0),
      },
      prds_by_status: prdsByStatus,
      epics_by_status: epicsByStatus,
    };
  }

  // ============ Private Helper Methods ============

  /**
   * Build the body for a review issue
   * @private
   */
  _buildReviewIssueBody({ documentType, documentKey, title, version, stakeholders, deadline, content }) {
    const stakeholderMentions = stakeholders.map((s) => `@${s.replace('@', '')}`).join(', ');
    const stakeholderChecklist = stakeholders.map((s) => `- [ ] @${s.replace('@', '')} - ⏳ Pending`).join('\n');

    return `## 📋 ${documentType.toUpperCase()} Review: ${title}

**Document Key:** \`${documentType}:${documentKey}\`
**Version:** v${version}
**Feedback Deadline:** ${deadline || 'Not set'}

---

### Stakeholders

${stakeholderMentions}

${stakeholderChecklist}

---

### Instructions

1. Review the ${documentType.toUpperCase()} document below
2. Submit feedback via \`/submit-feedback ${documentType}:${documentKey}\`
3. When ready, sign off via \`/signoff ${documentType}:${documentKey}\`

---

### Document Content

<details>
<summary>Click to expand ${documentType.toUpperCase()} content</summary>

${content}

</details>

---

_This review issue was created via Gate 1 (\`/publish-review\`)._
_Close this issue when the review round is complete._`;
  }

  // ============ GitHub API Wrappers (to be called via MCP) ============

  async _createIssue(_params) {
    // This would be: mcp__github__issue_write({ method: 'create', ... })
    throw new Error('_createIssue must be implemented by caller via GitHub MCP');
  }

  async _closeIssue(_issueNumber, _options) {
    // This would be: mcp__github__issue_write({ method: 'update', state: 'closed', ... })
    throw new Error('_closeIssue must be implemented by caller via GitHub MCP');
  }

  async _updateIssue(_issueNumber, _updates) {
    // This would be: mcp__github__issue_write({ method: 'update', ... })
    throw new Error('_updateIssue must be implemented by caller via GitHub MCP');
  }

  async _addComment(_issueNumber, _body) {
    // This would be: mcp__github__add_issue_comment({ ... })
    throw new Error('_addComment must be implemented by caller via GitHub MCP');
  }
}

module.exports = {
  GateManager,
  DOCUMENT_STATUS,
  STORY_STATUS,
  VALID_TRANSITIONS,
  GATES,
};
