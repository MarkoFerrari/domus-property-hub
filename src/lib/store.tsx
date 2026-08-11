/**
 * The single in-memory store for a landlord's portfolio.
 *
 * WHY THIS EXISTS (source of truth §6): resolving something must clear it from
 * every surface it appears on — property card badge, "Action needed" banner,
 * topbar pill, sidebar badge, mobile nav badge, notifications list — in the
 * same interaction, with no reload. One store holding the raw data, with
 * compliance and notifications derived from it via useMemo, makes that
 * structurally guaranteed rather than something you have to remember to do.
 *
 * Nothing derived is ever written back into state.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "./auth";
import * as db from "./db";
import type { CertRecord, Property } from "./compliance";
import {
  deadlineKey,
  obligationKey,
  rentKey,
  type DeadlineOverride,
  type DeadlineTarget,
  type DeclRecord,
  type ObligationType,
  type RentRecord,
} from "./ledger";
import { getNotifications, getNotificationCount, type NotificationItem } from "./notifications";
import { deleteCertificateFile, uploadCertificate } from "./storage";

type StoreValue = {
  loading: boolean;
  error: string | null;
  properties: Property[];
  /** Keyed `propertyId:YYYY-MM:stay|takk`. Use `obligationKey`. */
  declarations: Record<string, DeclRecord>;
  /** Keyed `propertyId:YYYY-MM`. Use `rentKey`. */
  rents: Record<string, RentRecord>;
  /** Only the exceptions. Keyed `propertyId:YYYY-MM:stay|takk|rent`. */
  deadlineOverrides: Record<string, DeadlineOverride>;
  dismissed: Set<string>;

  /** Derived, recomputed on every data change. Never stored. */
  notifications: NotificationItem[];
  visibleNotifications: NotificationItem[];
  notificationCount: number;

  refresh: () => Promise<void>;
  addProperty: (data: Omit<Property, "id">) => Promise<Property>;
  editProperty: (id: string, patch: Partial<Property>) => Promise<void>;
  removeProperty: (id: string) => Promise<void>;
  /**
   * Upload (optional) plus record update in one call. Components must not talk
   * to storage themselves, or a screen can save a record whose document never
   * made it, which is the false-compliance bug all over again.
   */
  saveCertificate: (
    propertyId: string,
    name: string,
    input: { file?: File; expiry?: string },
  ) => Promise<void>;
  removeCertificate: (propertyId: string, name: string) => Promise<void>;

  recordDeclaration: (
    propertyId: string,
    month: string,
    type: ObligationType,
    rec: DeclRecord,
  ) => Promise<void>;
  removeDeclaration: (propertyId: string, month: string, type: ObligationType) => Promise<void>;
  recordRent: (propertyId: string, month: string, rec: RentRecord) => Promise<void>;
  removeRent: (propertyId: string, month: string) => Promise<void>;

  setDeadline: (
    propertyId: string,
    month: string,
    target: DeadlineTarget,
    override: DeadlineOverride,
  ) => Promise<void>;
  clearDeadline: (propertyId: string, month: string, target: DeadlineTarget) => Promise<void>;

  dismiss: (notificationId: string) => Promise<void>;
  restore: (notificationId: string) => Promise<void>;

  onboarded: boolean;
  completeOnboarding: () => Promise<void>;

  seedDemo: () => Promise<number>;
};

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [declarations, setDeclarations] = useState<Record<string, DeclRecord>>({});
  const [rents, setRents] = useState<Record<string, RentRecord>>({});
  const [deadlineOverrides, setDeadlineOverrides] = useState<Record<string, DeadlineOverride>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [onboarded, setOnboardedState] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setProperties([]);
      setDeclarations({});
      setRents({});
      setDeadlineOverrides({});
      setDismissed(new Set());
      setOnboardedState(false);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [p, d, r, ov, dis, onb] = await Promise.all([
        db.listProperties(userId),
        db.loadDeclarations(userId),
        db.loadRent(userId),
        db.loadDeadlineOverrides(userId),
        db.loadDismissed(userId),
        db.getOnboarded(userId),
      ]);
      setProperties(p);
      setDeclarations(d);
      setRents(r);
      setDeadlineOverrides(ov);
      setDismissed(dis);
      setOnboardedState(onb);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your portfolio.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  /* ------------------------------ properties ------------------------------ */

  const addProperty = useCallback<StoreValue["addProperty"]>(
    async (data) => {
      if (!userId) throw new Error("Not signed in.");
      const created = await db.createProperty(userId, data);
      setProperties((list) => [...list, created]);
      return created;
    },
    [userId],
  );

  const editProperty = useCallback<StoreValue["editProperty"]>(
    async (id, patch) => {
      if (!userId) throw new Error("Not signed in.");
      await db.updateProperty(userId, id, patch);
      setProperties((list) =>
        list.map((p) =>
          p.id === id
            ? {
                ...p,
                ...patch,
                certDetails: patch.certDetails ?? p.certDetails,
                id,
              }
            : p,
        ),
      );
    },
    [userId],
  );

  const removeProperty = useCallback<StoreValue["removeProperty"]>(
    async (id) => {
      if (!userId) throw new Error("Not signed in.");
      await db.deleteProperty(userId, id);
      setProperties((list) => list.filter((p) => p.id !== id));
      setDeclarations((m) => stripPrefix(m, `${id}:`));
      setRents((m) => stripPrefix(m, `${id}:`));
      setDeadlineOverrides((m) => stripPrefix(m, `${id}:`));
    },
    [userId],
  );

  const applyCert = useCallback((propertyId: string, name: string, rec: CertRecord | undefined) => {
    setProperties((list) =>
      list.map((p) => {
        if (p.id !== propertyId) return p;
        const details = { ...(p.certDetails ?? {}) };
        if (!rec || (!rec.file && !rec.expiry)) delete details[name];
        else details[name] = rec;
        return { ...p, certDetails: details };
      }),
    );
  }, []);

  const saveCertificate = useCallback<StoreValue["saveCertificate"]>(
    async (propertyId, name, input) => {
      if (!userId) throw new Error("Not signed in.");
      const current = properties.find((p) => p.id === propertyId)?.certDetails?.[name];

      /* Upload FIRST. If it throws, nothing is written, so the record can never
         claim a document that is not there. */
      const uploaded = input.file
        ? await uploadCertificate(userId, propertyId, name, input.file)
        : undefined;

      const rec: CertRecord = {
        file: uploaded?.file ?? current?.file,
        path: uploaded?.path ?? (uploaded ? undefined : current?.path),
        demo: uploaded ? uploaded.demo : current?.demo,
        expiry: input.expiry,
      };

      await db.setCertificate(userId, propertyId, name, rec);
      applyCert(propertyId, name, rec);

      /* Only once the new record is safely stored does the old file go. */
      if (uploaded && current?.path && current.path !== rec.path) {
        await deleteCertificateFile(current.path);
      }
    },
    [userId, properties, applyCert],
  );

  const removeCertificate = useCallback<StoreValue["removeCertificate"]>(
    async (propertyId, name) => {
      if (!userId) throw new Error("Not signed in.");
      const current = properties.find((p) => p.id === propertyId)?.certDetails?.[name];
      await db.setCertificate(userId, propertyId, name, undefined);
      applyCert(propertyId, name, undefined);
      await deleteCertificateFile(current?.path);
    },
    [userId, properties, applyCert],
  );

  /* -------------------------------- ledger -------------------------------- */

  const recordDeclaration = useCallback<StoreValue["recordDeclaration"]>(
    async (propertyId, month, type, rec) => {
      if (!userId) throw new Error("Not signed in.");
      await db.saveDeclaration(userId, propertyId, month, type, rec);
      setDeclarations((m) => ({ ...m, [obligationKey(propertyId, month, type)]: rec }));
    },
    [userId],
  );

  const removeDeclaration = useCallback<StoreValue["removeDeclaration"]>(
    async (propertyId, month, type) => {
      if (!userId) throw new Error("Not signed in.");
      await db.deleteDeclaration(userId, propertyId, month, type);
      setDeclarations((m) => {
        const next = { ...m };
        delete next[obligationKey(propertyId, month, type)];
        return next;
      });
    },
    [userId],
  );

  const recordRent = useCallback<StoreValue["recordRent"]>(
    async (propertyId, month, rec) => {
      if (!userId) throw new Error("Not signed in.");
      await db.saveRent(userId, propertyId, month, rec);
      setRents((m) => ({ ...m, [rentKey(propertyId, month)]: rec }));
    },
    [userId],
  );

  const removeRent = useCallback<StoreValue["removeRent"]>(
    async (propertyId, month) => {
      if (!userId) throw new Error("Not signed in.");
      await db.deleteRent(userId, propertyId, month);
      setRents((m) => {
        const next = { ...m };
        delete next[rentKey(propertyId, month)];
        return next;
      });
    },
    [userId],
  );

  /* --------------------------- deadline overrides -------------------------- */

  const setDeadline = useCallback<StoreValue["setDeadline"]>(
    async (propertyId, month, target, override) => {
      if (!userId) throw new Error("Not signed in.");
      await db.setDeadlineOverride(userId, propertyId, month, target, override);
      setDeadlineOverrides((m) => ({ ...m, [deadlineKey(propertyId, month, target)]: override }));
    },
    [userId],
  );

  const clearDeadline = useCallback<StoreValue["clearDeadline"]>(
    async (propertyId, month, target) => {
      if (!userId) throw new Error("Not signed in.");
      await db.clearDeadlineOverride(userId, propertyId, month, target);
      setDeadlineOverrides((m) => {
        const next = { ...m };
        delete next[deadlineKey(propertyId, month, target)];
        return next;
      });
    },
    [userId],
  );

  /* ----------------------------- notifications ---------------------------- */

  const dismiss = useCallback<StoreValue["dismiss"]>(
    async (id) => {
      if (!userId) return;
      await db.dismissNotification(userId, id);
      setDismissed((s) => new Set(s).add(id));
    },
    [userId],
  );

  const restore = useCallback<StoreValue["restore"]>(
    async (id) => {
      if (!userId) return;
      await db.restoreNotification(userId, id);
      setDismissed((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    },
    [userId],
  );

  const completeOnboarding = useCallback(async () => {
    if (!userId) return;
    await db.setOnboarded(userId, true);
    setOnboardedState(true);
  }, [userId]);

  const seedDemo = useCallback(async () => {
    if (!userId) return 0;
    const n = await db.seedDemoPortfolio(userId);
    await refresh();
    return n;
  }, [userId, refresh]);

  /* -------------------------------- derived ------------------------------- */

  const notifications = useMemo(
    () => getNotifications(properties, declarations, rents),
    [properties, declarations, rents],
  );

  const visibleNotifications = useMemo(
    () => notifications.filter((n) => !dismissed.has(n.id)),
    [notifications, dismissed],
  );

  const notificationCount = useMemo(
    () => getNotificationCount(notifications, dismissed),
    [notifications, dismissed],
  );

  const value = useMemo<StoreValue>(
    () => ({
      loading,
      error,
      properties,
      declarations,
      rents,
      deadlineOverrides,
      dismissed,
      notifications,
      visibleNotifications,
      notificationCount,
      refresh,
      addProperty,
      editProperty,
      removeProperty,
      saveCertificate,
      removeCertificate,
      recordDeclaration,
      removeDeclaration,
      recordRent,
      removeRent,
      setDeadline,
      clearDeadline,
      dismiss,
      restore,
      onboarded,
      completeOnboarding,
      seedDemo,
    }),
    [
      loading, error, properties, declarations, rents, deadlineOverrides, dismissed,
      notifications, visibleNotifications, notificationCount, refresh,
      addProperty, editProperty, removeProperty, saveCertificate, removeCertificate,
      recordDeclaration, removeDeclaration, recordRent, removeRent,
      setDeadline, clearDeadline,
      dismiss, restore, onboarded, completeOnboarding, seedDemo,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function stripPrefix<T>(map: Record<string, T>, prefix: string): Record<string, T> {
  const next: Record<string, T> = {};
  for (const [k, v] of Object.entries(map)) if (!k.startsWith(prefix)) next[k] = v;
  return next;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

/** Convenience: one property by id, or undefined while loading / not found. */
export function useProperty(id: string | undefined) {
  const { properties } = useStore();
  return useMemo(() => properties.find((p) => p.id === id), [properties, id]);
}
