export {
  clearDemoSessionCookie,
  DEMO_COOKIE_NAME,
  DEMO_USER,
  DEMO_USER_ID,
  getDemoSessionUser,
  isDemoBannerEnabled,
  isDemoCookieSession,
  isDemoEntryUiEnabled,
  isDemoFeatureEnabled,
  isDemoMode,
  isDemoRequest,
  isDemoRequestFromNextRequest,
  isDemoUser,
  isGlobalDemoMode,
  setDemoSessionCookie,
} from "./session";

export {
  createSimulatedDemoSyncJob,
  DEMO_ACCOUNTS,
  DEMO_PREFERENCES,
  DEMO_PROCESSED_EMAILS,
  DEMO_SYNC_RUNS,
  getDemoActionLogPage,
  getDemoClassificationNote,
  getDemoConnectedAccounts,
  getDemoCleanupGroups,
  getDemoDashboardMetrics,
  getDemoEmailActivityPage,
  getDemoLastSyncedByAccount,
  getDemoLatestJob,
  getDemoSyncRunHistory,
} from "./fixtures";

export type { DemoPreference } from "./fixtures";

export {
  assertNotDemoMode,
  blockIfDemoMode,
  DemoModeBlockedError,
  demoModeBlockedResponse,
} from "./guards";
