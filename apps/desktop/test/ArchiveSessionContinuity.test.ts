import { describe, expect, it, vi } from "vitest";
import type {
  ObservableSnapshot,
  SessionId,
  WorkspaceId,
} from "@deepseek-ai/dsh-client-runtime/client";
import {
  installArchiveSessionContinuity,
  type ArchiveSessionContinuityRuntime,
} from "../../../plugins/desktop-chrome/src/client/archive-session-continuity.ts";

function sessionId(value: string): SessionId {
  return value as SessionId;
}

function workspaceId(value: string): WorkspaceId {
  return value as WorkspaceId;
}

function source<T>(initial: T): ObservableSnapshot<T> & { set: (next: T) => void } {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set: (next) => {
      snapshot = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

function fixture(current: SessionId | undefined = sessionId("current")) {
  const sessions = source({ current });
  const workspaces = source({
    archivedSessionIds: [] as SessionId[],
    items: [{
      workspaceId: workspaceId("workspace"),
      sessionIds: [sessionId("current"), sessionId("other")],
    }],
  });
  const startSession = vi.fn();
  const runtime: ArchiveSessionContinuityRuntime = {
    sessions: { list: sessions },
    workspaces: { list: workspaces, startSession },
  };
  return { runtime, sessions, workspaces, startSession };
}

describe("archived Session continuity", () => {
  it("starts a blank Session in the same Workspace after archiving the current Session", () => {
    const { runtime, sessions, workspaces, startSession } = fixture();
    installArchiveSessionContinuity(runtime);

    sessions.set({ current: undefined });
    workspaces.set({
      ...workspaces.getSnapshot(),
      archivedSessionIds: [sessionId("current")],
    });

    expect(startSession).toHaveBeenCalledOnce();
    expect(startSession).toHaveBeenCalledWith(workspaceId("workspace"));

    workspaces.set({ ...workspaces.getSnapshot() });
    expect(startSession).toHaveBeenCalledOnce();
  });

  it("does not navigate when a non-current Session is archived", () => {
    const { runtime, workspaces, startSession } = fixture();
    installArchiveSessionContinuity(runtime);

    workspaces.set({
      ...workspaces.getSnapshot(),
      archivedSessionIds: [sessionId("other")],
    });

    expect(startSession).not.toHaveBeenCalled();
  });

  it("does not turn an ordinary selection clear into a new Session", () => {
    const { runtime, sessions, workspaces, startSession } = fixture();
    installArchiveSessionContinuity(runtime);

    sessions.set({ current: undefined });
    workspaces.set({ ...workspaces.getSnapshot() });

    expect(startSession).not.toHaveBeenCalled();
  });

  it("uses the normal unscoped New Session fallback for an ungrouped archived Session", () => {
    const { runtime, sessions, workspaces, startSession } = fixture(sessionId("loose"));
    installArchiveSessionContinuity(runtime);

    sessions.set({ current: undefined });
    workspaces.set({
      ...workspaces.getSnapshot(),
      archivedSessionIds: [sessionId("loose")],
    });

    expect(startSession).toHaveBeenCalledWith(undefined);
  });

  it("tracks later Session selections and disposes with the plugin effect", () => {
    const { runtime, sessions, workspaces, startSession } = fixture();
    const dispose = installArchiveSessionContinuity(runtime);

    sessions.set({ current: sessionId("other") });
    workspaces.set({ ...workspaces.getSnapshot() });
    sessions.set({ current: undefined });
    workspaces.set({
      ...workspaces.getSnapshot(),
      archivedSessionIds: [sessionId("other")],
    });
    expect(startSession).toHaveBeenCalledWith(workspaceId("workspace"));

    dispose();
    sessions.set({ current: sessionId("current") });
    workspaces.set({ ...workspaces.getSnapshot(), archivedSessionIds: [] });
    sessions.set({ current: undefined });
    workspaces.set({
      ...workspaces.getSnapshot(),
      archivedSessionIds: [sessionId("current")],
    });
    expect(startSession).toHaveBeenCalledOnce();
  });
});
