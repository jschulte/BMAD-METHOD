/**
 * Tests for GateManager - Two-Gate Publish Model for PRD/Epic Crowdsourcing
 *
 * Tests cover:
 * - Constants and type definitions
 * - Gate 1 validation (validateForReview)
 * - Gate 1 publishing (publishForReview)
 * - Gate 2 validation (validateForShipping)
 * - Gate 2 shipping (shipStories)
 * - Story recall (recallStories)
 * - Status transitions
 * - Query methods
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GateManager,
  DOCUMENT_STATUS,
  STORY_STATUS,
  VALID_TRANSITIONS,
  GATES,
} from '../../../src/modules/bmm/lib/crowdsource/gate-manager.js';

// Mock CacheManager for testing
class MockCacheManager {
  constructor() {
    this.prds = {};
    this.epics = {};
    this.stories = {};
  }

  readPrd(prdKey, _options = {}) {
    return this.prds[prdKey] || null;
  }

  writePrd(prdKey, content, meta) {
    this.prds[prdKey] = { content, meta };
    return { prdKey, path: `/cache/prds/${prdKey}.md`, hash: 'test-hash', timestamp: new Date().toISOString() };
  }

  listCachedPrds() {
    return Object.keys(this.prds);
  }

  readEpic(epicKey, _options = {}) {
    return this.epics[epicKey] || null;
  }

  writeEpic(epicKey, content, meta) {
    this.epics[epicKey] = { content, meta };
    return { epicKey, path: `/cache/epics/${epicKey}.md`, hash: 'test-hash', timestamp: new Date().toISOString() };
  }

  listCachedEpics() {
    return Object.keys(this.epics);
  }

  readStory(storyKey, _options = {}) {
    return this.stories[storyKey] || null;
  }

  writeStory(storyKey, content, meta) {
    this.stories[storyKey] = { content, meta };
    return { storyKey, path: `/cache/stories/${storyKey}.md`, hash: 'test-hash', timestamp: new Date().toISOString() };
  }

  listCachedStories() {
    return Object.keys(this.stories);
  }
}

// Create a testable subclass that allows injecting mock implementations
class TestableGateManager extends GateManager {
  constructor(config, mocks = {}) {
    super(config);
    this.mocks = mocks;
  }

  async _createIssue(params) {
    if (this.mocks.createIssue) {
      return this.mocks.createIssue(params);
    }
    throw new Error('Mock not provided for _createIssue');
  }

  async _closeIssue(issueNumber, options) {
    if (this.mocks.closeIssue) {
      return this.mocks.closeIssue(issueNumber, options);
    }
    throw new Error('Mock not provided for _closeIssue');
  }

  async _updateIssue(issueNumber, updates) {
    if (this.mocks.updateIssue) {
      return this.mocks.updateIssue(issueNumber, updates);
    }
    throw new Error('Mock not provided for _updateIssue');
  }

  async _addComment(issueNumber, body) {
    if (this.mocks.addComment) {
      return this.mocks.addComment(issueNumber, body);
    }
    throw new Error('Mock not provided for _addComment');
  }
}

describe('GateManager', () => {
  // ============ Constants Tests ============

  describe('DOCUMENT_STATUS', () => {
    it('should define all document statuses', () => {
      expect(DOCUMENT_STATUS.draft).toBe('draft');
      expect(DOCUMENT_STATUS.published).toBe('published');
      expect(DOCUMENT_STATUS.feedback).toBe('feedback');
      expect(DOCUMENT_STATUS.synthesis).toBe('synthesis');
      expect(DOCUMENT_STATUS.signoff).toBe('signoff');
      expect(DOCUMENT_STATUS.approved).toBe('approved');
      expect(DOCUMENT_STATUS.blocked).toBe('blocked');
      expect(DOCUMENT_STATUS.revision).toBe('revision');
    });
  });

  describe('STORY_STATUS', () => {
    it('should define all story statuses', () => {
      expect(STORY_STATUS.draft).toBe('draft');
      expect(STORY_STATUS.ready_for_dev).toBe('ready-for-dev');
      expect(STORY_STATUS.in_progress).toBe('in-progress');
      expect(STORY_STATUS.in_review).toBe('in-review');
      expect(STORY_STATUS.done).toBe('done');
      expect(STORY_STATUS.blocked).toBe('blocked');
      expect(STORY_STATUS.recalled).toBe('recalled');
      expect(STORY_STATUS.do_not_develop).toBe('do-not-develop');
    });
  });

  describe('GATES', () => {
    it('should define gate numbers', () => {
      expect(GATES.REVIEW).toBe(1);
      expect(GATES.DEV).toBe(2);
    });
  });

  describe('VALID_TRANSITIONS', () => {
    it('should allow draft to published transition', () => {
      expect(VALID_TRANSITIONS.draft).toContain('published');
    });

    it('should allow published to feedback transition', () => {
      expect(VALID_TRANSITIONS.published).toContain('feedback');
    });

    it('should allow signoff to approved transition', () => {
      expect(VALID_TRANSITIONS.signoff).toContain('approved');
    });

    it('should allow approved to revision transition', () => {
      expect(VALID_TRANSITIONS.approved).toContain('revision');
    });

    it('should not allow transitions from done status', () => {
      expect(VALID_TRANSITIONS.done).toEqual([]);
    });
  });

  // ============ Gate 1: Validation Tests ============

  describe('validateForReview()', () => {
    let cacheManager;
    let gateManager;

    beforeEach(() => {
      cacheManager = new MockCacheManager();
      gateManager = new TestableGateManager({
        cacheManager,
        owner: 'test-org',
        repo: 'test-repo',
      });
    });

    it('should fail validation if PRD does not exist', () => {
      const result = gateManager.validateForReview('prd', 'nonexistent');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('not found in local cache');
    });

    it('should fail validation if Epic does not exist', () => {
      const result = gateManager.validateForReview('epic', 'nonexistent');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('not found in local cache');
    });

    it('should pass validation for draft PRD', () => {
      cacheManager.writePrd('user-auth', '# PRD Content', {
        status: 'draft',
        stakeholders: ['@alice', '@bob'],
      });

      const result = gateManager.validateForReview('prd', 'user-auth');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass validation for revision PRD', () => {
      cacheManager.writePrd('user-auth', '# PRD Content', {
        status: 'revision',
        stakeholders: ['@alice'],
      });

      const result = gateManager.validateForReview('prd', 'user-auth');

      expect(result.valid).toBe(true);
    });

    it('should pass validation for blocked PRD', () => {
      cacheManager.writePrd('user-auth', '# PRD Content', {
        status: 'blocked',
        stakeholders: ['@alice'],
      });

      const result = gateManager.validateForReview('prd', 'user-auth');

      expect(result.valid).toBe(true);
    });

    it('should fail validation for feedback status PRD', () => {
      cacheManager.writePrd('user-auth', '# PRD Content', {
        status: 'feedback',
        stakeholders: ['@alice'],
      });

      const result = gateManager.validateForReview('prd', 'user-auth');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Can only publish documents in draft, revision, or blocked status');
    });

    it('should fail validation for approved status PRD', () => {
      cacheManager.writePrd('user-auth', '# PRD Content', {
        status: 'approved',
        stakeholders: ['@alice'],
      });

      const result = gateManager.validateForReview('prd', 'user-auth');

      expect(result.valid).toBe(false);
    });

    it('should fail validation if PRD has no content', () => {
      cacheManager.writePrd('user-auth', '', { status: 'draft' });

      const result = gateManager.validateForReview('prd', 'user-auth');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("PRD 'user-auth' has no content.");
    });

    it('should warn if no stakeholders defined', () => {
      cacheManager.writePrd('user-auth', '# PRD Content', {
        status: 'draft',
        stakeholders: [],
      });

      const result = gateManager.validateForReview('prd', 'user-auth');

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('No stakeholders defined');
    });

    it('should warn if Epic source PRD is not approved', () => {
      cacheManager.writePrd('user-auth', '# PRD Content', {
        status: 'feedback',
      });
      cacheManager.writeEpic('2', '# Epic Content', {
        status: 'draft',
        prd_key: 'user-auth',
        stakeholders: ['@alice'],
      });

      const result = gateManager.validateForReview('epic', '2');

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('Source PRD'))).toBe(true);
    });

    it('should not warn if Epic source PRD is approved', () => {
      cacheManager.writePrd('user-auth', '# PRD Content', {
        status: 'approved',
      });
      cacheManager.writeEpic('2', '# Epic Content', {
        status: 'draft',
        prd_key: 'user-auth',
        stakeholders: ['@alice'],
      });

      const result = gateManager.validateForReview('epic', '2');

      expect(result.warnings.every((w) => !w.includes('Source PRD'))).toBe(true);
    });
  });

  // ============ Gate 1: Publish Tests ============

  describe('publishForReview()', () => {
    let cacheManager;
    let gateManager;
    let createdIssues;

    beforeEach(() => {
      cacheManager = new MockCacheManager();
      createdIssues = [];

      gateManager = new TestableGateManager(
        {
          cacheManager,
          owner: 'test-org',
          repo: 'test-repo',
        },
        {
          createIssue: async (params) => {
            const issue = { number: 100 + createdIssues.length, ...params };
            createdIssues.push(issue);
            return issue;
          },
        },
      );
    });

    it('should fail if document does not exist', async () => {
      const result = await gateManager.publishForReview({
        documentType: 'prd',
        documentKey: 'nonexistent',
        title: 'Test PRD',
        stakeholders: ['@alice'],
        deadline: '2026-01-15',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(createdIssues).toHaveLength(0);
    });

    it('should create GitHub review issue for valid PRD', async () => {
      cacheManager.writePrd('user-auth', '# User Authentication PRD', {
        status: 'draft',
        version: 1,
        stakeholders: ['@alice', '@bob'],
      });

      const result = await gateManager.publishForReview({
        documentType: 'prd',
        documentKey: 'user-auth',
        title: 'User Authentication',
        stakeholders: ['@alice', '@bob'],
        deadline: '2026-01-15',
      });

      expect(result.success).toBe(true);
      expect(result.reviewIssueNumber).toBe(100);
      expect(createdIssues).toHaveLength(1);
      expect(createdIssues[0].title).toContain('PRD Review: User Authentication');
      expect(createdIssues[0].labels).toContain('type:prd-review');
      expect(createdIssues[0].labels).toContain('prd:user-auth');
      expect(createdIssues[0].labels).toContain('review-status:open');
    });

    it('should update cache with review issue number', async () => {
      cacheManager.writePrd('user-auth', '# User Authentication PRD', {
        status: 'draft',
        version: 1,
      });

      await gateManager.publishForReview({
        documentType: 'prd',
        documentKey: 'user-auth',
        title: 'User Authentication',
        stakeholders: ['@alice'],
        deadline: '2026-01-15',
      });

      const updatedPrd = cacheManager.readPrd('user-auth');
      expect(updatedPrd.meta.review_issue).toBe(100);
      expect(updatedPrd.meta.status).toBe('published');
    });

    it('should create GitHub review issue for valid Epic', async () => {
      cacheManager.writeEpic('2', '# Epic 2: Core Authentication', {
        status: 'draft',
        version: 1,
        prd_key: 'user-auth',
      });

      const result = await gateManager.publishForReview({
        documentType: 'epic',
        documentKey: '2',
        title: 'Core Authentication',
        stakeholders: ['@alice'],
        deadline: '2026-01-15',
      });

      expect(result.success).toBe(true);
      expect(createdIssues[0].title).toContain('EPIC Review: Core Authentication');
      expect(createdIssues[0].labels).toContain('type:epic-review');
      expect(createdIssues[0].labels).toContain('epic:2');
    });

    it('should include version in labels', async () => {
      cacheManager.writePrd('user-auth', '# PRD', {
        status: 'draft',
        version: 3,
      });

      await gateManager.publishForReview({
        documentType: 'prd',
        documentKey: 'user-auth',
        title: 'Test',
        stakeholders: ['@alice'],
        deadline: '2026-01-15',
      });

      expect(createdIssues[0].labels).toContain('version:3');
    });

    it('should return warnings from validation', async () => {
      cacheManager.writePrd('user-auth', '# PRD', {
        status: 'draft',
        version: 1,
        stakeholders: [], // No stakeholders - should generate warning
      });

      const result = await gateManager.publishForReview({
        documentType: 'prd',
        documentKey: 'user-auth',
        title: 'Test',
        stakeholders: [],
        deadline: '2026-01-15',
      });

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.includes('No stakeholders'))).toBe(true);
    });
  });

  // ============ Gate 2: Validation Tests ============

  describe('validateForShipping()', () => {
    let cacheManager;
    let gateManager;

    beforeEach(() => {
      cacheManager = new MockCacheManager();
      gateManager = new TestableGateManager({
        cacheManager,
        owner: 'test-org',
        repo: 'test-repo',
      });
    });

    it('should fail if epic does not exist', () => {
      const result = gateManager.validateForShipping('nonexistent');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not found in local cache');
    });

    it('should fail if epic is not approved (without force)', () => {
      cacheManager.writeEpic('2', '# Epic', {
        status: 'feedback',
        stories: ['2-1', '2-2'],
      });
      cacheManager.writeStory('2-1', '# Story 2-1', {});
      cacheManager.writeStory('2-2', '# Story 2-2', {});

      const result = gateManager.validateForShipping('2');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not approved');
      expect(result.errors[0]).toContain('Use --force');
    });

    it('should pass with warning if epic is not approved (with force)', () => {
      cacheManager.writeEpic('2', '# Epic', {
        status: 'feedback',
        stories: ['2-1'],
      });
      cacheManager.writeStory('2-1', '# Story 2-1', {});

      const result = gateManager.validateForShipping('2', { force: true });

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('not approved'))).toBe(true);
    });

    it('should pass if epic is approved', () => {
      cacheManager.writeEpic('2', '# Epic', {
        status: 'approved',
        stories: ['2-1'],
      });
      cacheManager.writeStory('2-1', '# Story 2-1', {});

      const result = gateManager.validateForShipping('2');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail if no stories found', () => {
      cacheManager.writeEpic('2', '# Epic', {
        status: 'approved',
        stories: [],
      });

      const result = gateManager.validateForShipping('2');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('No stories found');
    });

    it('should fail if story not in cache', () => {
      cacheManager.writeEpic('2', '# Epic', {
        status: 'approved',
        stories: ['2-1', '2-2'],
      });
      cacheManager.writeStory('2-1', '# Story 2-1', {});
      // 2-2 is not in cache

      const result = gateManager.validateForShipping('2');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("'2-2' not found"))).toBe(true);
    });

    it('should warn and skip already shipped stories', () => {
      cacheManager.writeEpic('2', '# Epic', {
        status: 'approved',
        stories: ['2-1', '2-2'],
      });
      cacheManager.writeStory('2-1', '# Story 2-1', { github_issue: 123 });
      cacheManager.writeStory('2-2', '# Story 2-2', {});

      const result = gateManager.validateForShipping('2');

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('already has GitHub Issue'))).toBe(true);
      expect(result.stories).toHaveLength(1);
      expect(result.stories[0].storyKey).toBe('2-2');
    });

    it('should fail if story has no content', () => {
      cacheManager.writeEpic('2', '# Epic', {
        status: 'approved',
        stories: ['2-1'],
      });
      cacheManager.writeStory('2-1', '', {});

      const result = gateManager.validateForShipping('2');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('has no content'))).toBe(true);
    });

    it('should allow shipping specific stories only', () => {
      cacheManager.writeEpic('2', '# Epic', {
        status: 'approved',
        stories: ['2-1', '2-2', '2-3'],
      });
      cacheManager.writeStory('2-1', '# Story 2-1', {});
      cacheManager.writeStory('2-2', '# Story 2-2', {});
      cacheManager.writeStory('2-3', '# Story 2-3', {});

      const result = gateManager.validateForShipping('2', { storyKeys: ['2-1', '2-3'] });

      expect(result.valid).toBe(true);
      expect(result.stories).toHaveLength(2);
      expect(result.stories.map((s) => s.storyKey)).toEqual(['2-1', '2-3']);
    });
  });

  // ============ Gate 2: Ship Tests ============

  describe('shipStories()', () => {
    let cacheManager;
    let gateManager;
    let createdIssues;

    beforeEach(() => {
      cacheManager = new MockCacheManager();
      createdIssues = [];

      gateManager = new TestableGateManager(
        {
          cacheManager,
          owner: 'test-org',
          repo: 'test-repo',
        },
        {
          createIssue: async (params) => {
            const issue = { number: 200 + createdIssues.length, ...params };
            createdIssues.push(issue);
            return issue;
          },
        },
      );
    });

    it('should fail if epic is not approved (without force)', async () => {
      cacheManager.writeEpic('2', '# Epic', {
        status: 'feedback',
        stories: ['2-1'],
      });
      cacheManager.writeStory('2-1', '# Story 2-1', {});

      const result = await gateManager.shipStories({
        epicKey: '2',
        prdKey: 'user-auth',
      });

      expect(result.success).toBe(false);
      expect(createdIssues).toHaveLength(0);
    });

    it('should ship stories when epic is approved', async () => {
      cacheManager.writeEpic('2', '# Epic', {
        status: 'approved',
        stories: ['2-1', '2-2'],
      });
      cacheManager.writeStory('2-1', '# Story 2-1: Login\n\nImplement login', {});
      cacheManager.writeStory('2-2', '# Story 2-2: Logout\n\nImplement logout', {});

      const result = await gateManager.shipStories({
        epicKey: '2',
        prdKey: 'user-auth',
      });

      expect(result.success).toBe(true);
      expect(result.shippedStories).toHaveLength(2);
      expect(createdIssues).toHaveLength(2);
    });

    it('should create issues with correct labels', async () => {
      cacheManager.writeEpic('2', '# Epic', {
        status: 'approved',
        stories: ['2-1'],
      });
      cacheManager.writeStory('2-1', '# Story 2-1: Login', {});

      await gateManager.shipStories({
        epicKey: '2',
        prdKey: 'user-auth',
      });

      expect(createdIssues[0].labels).toContain('type:story');
      expect(createdIssues[0].labels).toContain('epic:2');
      expect(createdIssues[0].labels).toContain('prd:user-auth');
      expect(createdIssues[0].labels).toContain('status:ready-for-dev');
    });

    it('should update cache with GitHub issue numbers', async () => {
      cacheManager.writeEpic('2', '# Epic', {
        status: 'approved',
        stories: ['2-1'],
      });
      cacheManager.writeStory('2-1', '# Story 2-1: Login', {});

      await gateManager.shipStories({
        epicKey: '2',
        prdKey: 'user-auth',
      });

      const updatedStory = cacheManager.readStory('2-1');
      expect(updatedStory.meta.github_issue).toBe(200);
      expect(updatedStory.meta.status).toBe('ready-for-dev');
      expect(updatedStory.meta.shipped_at).toBeDefined();
    });

    it('should ship with force flag even if epic not approved', async () => {
      cacheManager.writeEpic('2', '# Epic', {
        status: 'feedback',
        stories: ['2-1'],
      });
      cacheManager.writeStory('2-1', '# Story 2-1: Login', {});

      const result = await gateManager.shipStories({
        epicKey: '2',
        prdKey: 'user-auth',
        options: { force: true },
      });

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.includes('not approved'))).toBe(true);
    });

    it('should parse story title from content', async () => {
      cacheManager.writeEpic('2', '# Epic', {
        status: 'approved',
        stories: ['2-1'],
      });
      cacheManager.writeStory('2-1', '# Implement User Login\n\nAs a user...', {});

      await gateManager.shipStories({
        epicKey: '2',
        prdKey: 'user-auth',
      });

      expect(createdIssues[0].title).toBe('[Story] Implement User Login');
    });

    it('should skip already shipped stories', async () => {
      cacheManager.writeEpic('2', '# Epic', {
        status: 'approved',
        stories: ['2-1', '2-2'],
      });
      cacheManager.writeStory('2-1', '# Story 2-1', { github_issue: 999 }); // Already shipped
      cacheManager.writeStory('2-2', '# Story 2-2', {});

      const result = await gateManager.shipStories({
        epicKey: '2',
        prdKey: 'user-auth',
      });

      expect(result.shippedStories).toHaveLength(1);
      expect(result.shippedStories[0].storyKey).toBe('2-2');
      expect(result.warnings.some((w) => w.includes('already has GitHub Issue'))).toBe(true);
    });
  });

  // ============ Recall Stories Tests ============

  describe('recallStories()', () => {
    let cacheManager;
    let gateManager;
    let closedIssues;

    beforeEach(() => {
      cacheManager = new MockCacheManager();
      closedIssues = [];

      gateManager = new TestableGateManager(
        {
          cacheManager,
          owner: 'test-org',
          repo: 'test-repo',
        },
        {
          closeIssue: async (issueNumber, options) => {
            closedIssues.push({ issueNumber, ...options });
            return { number: issueNumber, state: 'closed' };
          },
        },
      );
    });

    it('should fail if no stories specified', async () => {
      const result = await gateManager.recallStories({});

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('No stories specified');
    });

    it('should fail if story not in cache', async () => {
      const result = await gateManager.recallStories({
        storyKeys: ['nonexistent'],
        reason: 'Scope change',
      });

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('not found in cache');
    });

    it('should fail if story has no GitHub issue', async () => {
      cacheManager.writeStory('2-1', '# Story', {}); // No github_issue

      const result = await gateManager.recallStories({
        storyKeys: ['2-1'],
        reason: 'Scope change',
      });

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('has no GitHub Issue');
    });

    it('should recall shipped story successfully', async () => {
      cacheManager.writeStory('2-1', '# Story', { github_issue: 200 });

      const result = await gateManager.recallStories({
        storyKeys: ['2-1'],
        reason: 'Scope change',
      });

      expect(result.success).toBe(true);
      expect(result.recalledStories).toHaveLength(1);
      expect(result.recalledStories[0].issueNumber).toBe(200);
      expect(closedIssues).toHaveLength(1);
    });

    it('should update cache with recalled status', async () => {
      cacheManager.writeStory('2-1', '# Story', { github_issue: 200 });

      await gateManager.recallStories({
        storyKeys: ['2-1'],
        reason: 'Scope change',
      });

      const updatedStory = cacheManager.readStory('2-1');
      expect(updatedStory.meta.status).toBe('recalled');
      expect(updatedStory.meta.recalled_at).toBeDefined();
      expect(updatedStory.meta.recall_reason).toBe('Scope change');
    });

    it('should recall all stories for an epic', async () => {
      cacheManager.writeEpic('2', '# Epic', {
        stories: ['2-1', '2-2'],
      });
      cacheManager.writeStory('2-1', '# Story 2-1', { github_issue: 200 });
      cacheManager.writeStory('2-2', '# Story 2-2', { github_issue: 201 });

      const result = await gateManager.recallStories({
        epicKey: '2',
        reason: 'Epic revision',
      });

      expect(result.success).toBe(true);
      expect(result.recalledStories).toHaveLength(2);
      expect(closedIssues).toHaveLength(2);
    });

    it('should add correct labels when closing', async () => {
      cacheManager.writeStory('2-1', '# Story', { github_issue: 200 });

      await gateManager.recallStories({
        storyKeys: ['2-1'],
        reason: 'Test',
      });

      expect(closedIssues[0].labels_to_add).toContain('status:recalled');
      expect(closedIssues[0].labels_to_remove).toContain('status:ready-for-dev');
    });
  });

  // ============ Status Transition Tests ============

  describe('isValidTransition()', () => {
    let gateManager;

    beforeEach(() => {
      gateManager = new TestableGateManager({
        cacheManager: new MockCacheManager(),
        owner: 'test-org',
        repo: 'test-repo',
      });
    });

    it('should allow draft to published', () => {
      expect(gateManager.isValidTransition('draft', 'published')).toBe(true);
    });

    it('should not allow draft to approved', () => {
      expect(gateManager.isValidTransition('draft', 'approved')).toBe(false);
    });

    it('should allow signoff to approved', () => {
      expect(gateManager.isValidTransition('signoff', 'approved')).toBe(true);
    });

    it('should allow signoff to blocked', () => {
      expect(gateManager.isValidTransition('signoff', 'blocked')).toBe(true);
    });

    it('should not allow done to any status', () => {
      expect(gateManager.isValidTransition('done', 'draft')).toBe(false);
      expect(gateManager.isValidTransition('done', 'ready_for_dev')).toBe(false);
    });

    it('should return false for unknown status', () => {
      expect(gateManager.isValidTransition('unknown', 'draft')).toBe(false);
    });
  });

  describe('getValidNextStatuses()', () => {
    let gateManager;

    beforeEach(() => {
      gateManager = new TestableGateManager({
        cacheManager: new MockCacheManager(),
        owner: 'test-org',
        repo: 'test-repo',
      });
    });

    it('should return valid transitions for draft', () => {
      const next = gateManager.getValidNextStatuses('draft');
      expect(next).toContain('published');
    });

    it('should return valid transitions for signoff', () => {
      const next = gateManager.getValidNextStatuses('signoff');
      expect(next).toContain('approved');
      expect(next).toContain('blocked');
      expect(next).toContain('feedback');
    });

    it('should return empty array for done', () => {
      const next = gateManager.getValidNextStatuses('done');
      expect(next).toEqual([]);
    });

    it('should return empty array for unknown status', () => {
      const next = gateManager.getValidNextStatuses('unknown');
      expect(next).toEqual([]);
    });
  });

  // ============ Query Method Tests ============

  describe('getDocumentsReadyForReview()', () => {
    let cacheManager;
    let gateManager;

    beforeEach(() => {
      cacheManager = new MockCacheManager();
      gateManager = new TestableGateManager({
        cacheManager,
        owner: 'test-org',
        repo: 'test-repo',
      });
    });

    it('should return draft PRDs', () => {
      cacheManager.writePrd('prd-1', '# PRD 1', { status: 'draft' });
      cacheManager.writePrd('prd-2', '# PRD 2', { status: 'approved' });

      const result = gateManager.getDocumentsReadyForReview();

      expect(result.prds).toHaveLength(1);
      expect(result.prds[0].key).toBe('prd-1');
    });

    it('should return revision and blocked PRDs', () => {
      cacheManager.writePrd('prd-1', '# PRD 1', { status: 'revision' });
      cacheManager.writePrd('prd-2', '# PRD 2', { status: 'blocked' });
      cacheManager.writePrd('prd-3', '# PRD 3', { status: 'feedback' });

      const result = gateManager.getDocumentsReadyForReview();

      expect(result.prds).toHaveLength(2);
    });

    it('should return draft Epics', () => {
      cacheManager.writeEpic('epic-1', '# Epic 1', { status: 'draft' });
      cacheManager.writeEpic('epic-2', '# Epic 2', { status: 'approved' });

      const result = gateManager.getDocumentsReadyForReview();

      expect(result.epics).toHaveLength(1);
      expect(result.epics[0].key).toBe('epic-1');
    });
  });

  describe('getEpicsReadyForShipping()', () => {
    let cacheManager;
    let gateManager;

    beforeEach(() => {
      cacheManager = new MockCacheManager();
      gateManager = new TestableGateManager({
        cacheManager,
        owner: 'test-org',
        repo: 'test-repo',
      });
    });

    it('should return approved epics with unshipped stories', () => {
      cacheManager.writeEpic('2', '# Epic 2', {
        status: 'approved',
        stories: ['2-1', '2-2'],
      });
      cacheManager.writeStory('2-1', '# Story', {});
      cacheManager.writeStory('2-2', '# Story', {});

      const result = gateManager.getEpicsReadyForShipping();

      expect(result).toHaveLength(1);
      expect(result[0].epicKey).toBe('2');
      expect(result[0].storyCount).toBe(2);
      expect(result[0].unshippedCount).toBe(2);
    });

    it('should not return epics without unshipped stories', () => {
      cacheManager.writeEpic('2', '# Epic 2', {
        status: 'approved',
        stories: ['2-1'],
      });
      cacheManager.writeStory('2-1', '# Story', { github_issue: 100 }); // Already shipped

      const result = gateManager.getEpicsReadyForShipping();

      expect(result).toHaveLength(0);
    });

    it('should not return non-approved epics', () => {
      cacheManager.writeEpic('2', '# Epic 2', {
        status: 'feedback',
        stories: ['2-1'],
      });
      cacheManager.writeStory('2-1', '# Story', {});

      const result = gateManager.getEpicsReadyForShipping();

      expect(result).toHaveLength(0);
    });
  });

  describe('getGateSummary()', () => {
    let cacheManager;
    let gateManager;

    beforeEach(() => {
      cacheManager = new MockCacheManager();
      gateManager = new TestableGateManager({
        cacheManager,
        owner: 'test-org',
        repo: 'test-repo',
      });
    });

    it('should return summary of documents at each gate', () => {
      cacheManager.writePrd('prd-1', '# PRD 1', { status: 'draft' });
      cacheManager.writePrd('prd-2', '# PRD 2', { status: 'approved' });
      cacheManager.writeEpic('2', '# Epic 2', {
        status: 'approved',
        stories: ['2-1'],
      });
      cacheManager.writeStory('2-1', '# Story', {});

      const summary = gateManager.getGateSummary();

      expect(summary.gate1_ready.prds).toBe(1);
      expect(summary.gate2_ready.epics).toBe(1);
      expect(summary.prds_by_status).toEqual({ draft: 1, approved: 1 });
      expect(summary.epics_by_status).toEqual({ approved: 1 });
    });

    it('should count total unshipped stories', () => {
      cacheManager.writeEpic('2', '# Epic 2', {
        status: 'approved',
        stories: ['2-1', '2-2'],
      });
      cacheManager.writeEpic('3', '# Epic 3', {
        status: 'approved',
        stories: ['3-1'],
      });
      cacheManager.writeStory('2-1', '# Story', {});
      cacheManager.writeStory('2-2', '# Story', {});
      cacheManager.writeStory('3-1', '# Story', {});

      const summary = gateManager.getGateSummary();

      expect(summary.gate2_ready.total_unshipped_stories).toBe(3);
    });
  });

  // ============ Error Handling Tests ============

  describe('error handling', () => {
    it('should throw error if _createIssue is not mocked', async () => {
      const cacheManager = new MockCacheManager();
      cacheManager.writePrd('test', '# Test', { status: 'draft' });

      const gateManager = new GateManager({
        cacheManager,
        owner: 'test-org',
        repo: 'test-repo',
      });

      await expect(
        gateManager.publishForReview({
          documentType: 'prd',
          documentKey: 'test',
          title: 'Test',
          stakeholders: ['@alice'],
          deadline: '2026-01-15',
        }),
      ).rejects.toThrow('_createIssue must be implemented');
    });

    it('should return error if _closeIssue is not mocked', async () => {
      const cacheManager = new MockCacheManager();
      cacheManager.writeStory('2-1', '# Story', { github_issue: 100 });

      const gateManager = new GateManager({
        cacheManager,
        owner: 'test-org',
        repo: 'test-repo',
      });

      // recallStories catches errors gracefully and returns them
      const result = await gateManager.recallStories({
        storyKeys: ['2-1'],
        reason: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('_closeIssue must be implemented'))).toBe(true);
    });
  });
});
