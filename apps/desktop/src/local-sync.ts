import { PendingChange, SyncPullRequest, SyncPushRequest, SyncStatus } from "@aethina/shared-types";

export class LocalSyncClient {
  constructor(private readonly apiBaseUrl: string) {}

  async pushPendingChanges(changes: PendingChange[], deviceId: string, schoolId: string) {
    const payload: SyncPushRequest = { deviceId, schoolId, changes };
    const response = await fetch(`${this.apiBaseUrl}/sync/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      return changes.map((change) => ({ ...change, syncStatus: SyncStatus.Failed }));
    }
    return response.json();
  }

  async pullServerChanges(request: SyncPullRequest) {
    const response = await fetch(`${this.apiBaseUrl}/sync/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });
    if (!response.ok) {
      throw new Error(`Pull failed with status ${response.status}`);
    }
    return response.json();
  }

  async retryFailed(deviceId: string, schoolId: string) {
    const response = await fetch(`${this.apiBaseUrl}/sync/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, schoolId })
    });
    if (!response.ok) {
      throw new Error(`Retry failed with status ${response.status}`);
    }
    return response.json();
  }
}
