/**
 * Cron API Route Tests
 * Tests for api/cron/ endpoints
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the routes
vi.mock('../lib/services/case-leaderboard', () => ({
  postCaseLeaderboard: vi.fn(),
}));

vi.mock('../lib/services/case-queue-report', () => ({
  postCaseQueueReport: vi.fn(),
}));

vi.mock('../lib/services/case-queue-snapshots', () => ({
  pullAndStoreCaseQueueSnapshot: vi.fn(),
}));

vi.mock('../lib/services/app-settings', () => ({
  getAppSetting: vi.fn(),
  getAppSettingWithFallback: vi.fn(),
  APP_SETTING_KEYS: {
    leaderboardChannel: "mobiz_leaderboard_channel",
    queueReportChannel: "mobiz_queue_report_channel",
  },
}));

describe('Cron API', () => {
  let postCaseLeaderboard: any;
  let postCaseQueueReport: any;
  let pullAndStoreCaseQueueSnapshot: any;
  let getAppSettingWithFallback: any;
  let getAppSetting: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();

    // Get mocked functions
    const leaderboardModule = await import('../lib/services/case-leaderboard');
    const reportModule = await import('../lib/services/case-queue-report');
    const snapshotsModule = await import('../lib/services/case-queue-snapshots');
    const appSettingsModule = await import('../lib/services/app-settings');

    postCaseLeaderboard = vi.mocked(leaderboardModule.postCaseLeaderboard);
    postCaseQueueReport = vi.mocked(reportModule.postCaseQueueReport);
    pullAndStoreCaseQueueSnapshot = vi.mocked(snapshotsModule.pullAndStoreCaseQueueSnapshot);
    getAppSettingWithFallback = vi.mocked(appSettingsModule.getAppSettingWithFallback);
    getAppSetting = vi.mocked(appSettingsModule.getAppSetting);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('Case Leaderboard API', () => {
    it('should post leaderboard successfully with channel parameter', async () => {
      // Arrange
      postCaseLeaderboard.mockResolvedValue(undefined);

      const { POST } = await import('../api/cron/case-leaderboard');
      const request = new Request('http://localhost:3000/api/cron/case-leaderboard?channel=test-channel', {
        method: 'POST',
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(postCaseLeaderboard).toHaveBeenCalledWith({
        channelId: 'test-channel',
        days: undefined
      });
    });

    it('should use app settings when channel parameter not provided', async () => {
      // Arrange
      getAppSettingWithFallback.mockResolvedValue('default-channel');
      postCaseLeaderboard.mockResolvedValue(undefined);

      const { POST } = await import('../api/cron/case-leaderboard');
      const request = new Request('http://localhost:3000/api/cron/case-leaderboard', {
        method: 'POST',
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(postCaseLeaderboard).toHaveBeenCalledWith({
        channelId: 'default-channel',
        days: undefined
      });
    });

    it('should return error when channel is missing', async () => {
      // Arrange
      getAppSettingWithFallback.mockResolvedValue(null);

      const { POST } = await import('../api/cron/case-leaderboard');
      const request = new Request('http://localhost:3000/api/cron/case-leaderboard', {
        method: 'POST',
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(data.message).toBe('Missing channel parameter or MOBIZ_LEADERBOARD_CHANNEL');
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      postCaseLeaderboard.mockRejectedValue(new Error('Service error'));

      const { POST } = await import('../api/cron/case-leaderboard');
      const request = new Request('http://localhost:3000/api/cron/case-leaderboard?channel=test-channel', {
        method: 'POST',
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data.status).toBe('error');
      expect(data.message).toBe('Service error');
    });

    it('should work with POST requests', async () => {
      // Arrange
      postCaseLeaderboard.mockResolvedValue(undefined);

      const { POST } = await import('../api/cron/case-leaderboard');
      const request = new Request('http://localhost:3000/api/cron/case-leaderboard', {
        method: 'POST',
        body: JSON.stringify({ channel: 'test-channel' }),
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });
  });

  describe('Case Queue Report API', () => {
    it('should post queue report successfully', async () => {
      // Arrange
      getAppSetting.mockResolvedValue({
        queue_report_channel: 'test-channel'
      });
      postCaseQueueReport.mockResolvedValue(undefined);

      const { POST } = await import('../api/cron/case-queue-report');
      const request = new Request('http://localhost:3000/api/cron/case-queue-report?channel=test-channel', {
        method: 'POST',
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(postCaseQueueReport).toHaveBeenCalledWith({
        channelId: 'test-channel',
        mentionUserIds: [],
        includeUnassignedChart: false,
        includeUnassignedDetails: false,
        includeHighPriorityDataset: true,
        maxAgeMinutes: 240,
        minRows: 3,
      });
    });

    it('should parse mentions parameter correctly', async () => {
      // Arrange
      getAppSetting.mockResolvedValue({
        queue_report_channel: 'test-channel'
      });
      postCaseQueueReport.mockResolvedValue(undefined);

      const { POST } = await import('../api/cron/case-queue-report');
      const request = new Request('http://localhost:3000/api/cron/case-queue-report?channel=test-channel&mentions=@user1,@user2', {
        method: 'POST',
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(postCaseQueueReport).toHaveBeenCalledWith({
        channelId: 'test-channel',
        mentionUserIds: ['@user1', '@user2'],
        includeUnassignedChart: false,
        includeUnassignedDetails: false,
        includeHighPriorityDataset: true,
        maxAgeMinutes: 240,
        minRows: 3,
      });
    });

    it('should parse includeUnassigned parameter', async () => {
      // Arrange
      getAppSetting.mockResolvedValue({
        queue_report_channel: 'test-channel'
      });
      postCaseQueueReport.mockResolvedValue(undefined);

      const { POST } = await import('../api/cron/case-queue-report');
      const request = new Request('http://localhost:3000/api/cron/case-queue-report?channel=test-channel&includeUnassigned=true', {
        method: 'POST',
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(postCaseQueueReport).toHaveBeenCalledWith({
        channelId: 'test-channel',
        mentionUserIds: undefined,
        includeUnassignedChart: true,
        includeUnassignedDetails: true,
        includeHighPriorityDataset: true,
        maxAgeMinutes: 240,
        minRows: 3,
      });
    });

    it('should return error when channel is missing', async () => {
      // Arrange
      getAppSetting.mockResolvedValue({
        queue_report_channel: null
      });

      const { POST } = await import('../api/cron/case-queue-report');
      const request = new Request('http://localhost:3000/api/cron/case-queue-report', {
        method: 'POST',
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data.status).toBe('error');
    });

    it('should handle null result from service', async () => {
      // Arrange
      getAppSetting.mockResolvedValue({
        queue_report_channel: 'test-channel'
      });
      postCaseQueueReport.mockResolvedValue(null);

      const { POST } = await import('../api/cron/case-queue-report');
      const request = new Request('http://localhost:3000/api/cron/case-queue-report?channel=test-channel', {
        method: 'POST',
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it('should work with POST requests', async () => {
      // Arrange
      getAppSetting.mockResolvedValue({
        queue_report_channel: 'test-channel'
      });
      postCaseQueueReport.mockResolvedValue(undefined);

      const { POST } = await import('../api/cron/case-queue-report');
      const request = new Request('http://localhost:3000/api/cron/case-queue-report', {
        method: 'POST',
        body: JSON.stringify({ channel: 'test-channel' }),
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });
  });

  describe('Case Queue Snapshot API', () => {
    it('should create and persist snapshot successfully', async () => {
      // Arrange
      pullAndStoreCaseQueueSnapshot.mockResolvedValue({
        snapshotAt: new Date(),
        inserted: 5
      });

      const { POST } = await import('../api/cron/case-queue-snapshot');

      // Act
      const response = await POST();

      // Assert
      expect(response.status).toBe(200);
      expect(pullAndStoreCaseQueueSnapshot).toHaveBeenCalled();
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      pullAndStoreCaseQueueSnapshot.mockRejectedValue(new Error('Service error'));

      const { POST } = await import('../api/cron/case-queue-snapshot');

      // Act
      const response = await POST();
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data.status).toBe('error');
      expect(data.message).toBe('Service error');
    });

    it('should work with POST requests', async () => {
      // Arrange
      pullAndStoreCaseQueueSnapshot.mockResolvedValue({
        snapshotAt: new Date(),
        inserted: 5
      });

      const { POST } = await import('../api/cron/case-queue-snapshot');

      // Act
      const response = await POST();

      // Assert
      expect(response.status).toBe(200);
    });
  });

  describe('Response Headers', () => {
    it('should set correct headers for cron endpoints', async () => {
      // Arrange
      postCaseLeaderboard.mockResolvedValue(undefined);

      const { POST } = await import('../api/cron/case-leaderboard');
      const request = new Request('http://localhost:3000/api/cron/case-leaderboard?channel=test-channel', {
        method: 'POST',
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.headers.get('content-type')).toBe('application/json');
    });
  });
});