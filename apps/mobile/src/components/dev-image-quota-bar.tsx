import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { fetchImageUsage, type ImageUsageSnapshot } from '@lib/debug';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

const POLL_INTERVAL_MS = 4000;

// Dev-only visibility into the Workers AI daily image budget (see
// apps/worker/src/images.ts and CLAUDE.md's Free tier ceilings) — the thing
// that turned into unexplained 502s on card images during progressive-
// loading testing until it got diagnosed by hand. Not user-facing product
// UI, so it's plain English rather than routed through i18next like the
// rest of the app's copy. Render this only behind `__DEV__` at the call
// site — it has no gate of its own.
export function DevImageQuotaBar() {
  const [usage, setUsage] = useState<ImageUsageSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetchImageUsage().then((snapshot) => {
        if (!cancelled) setUsage(snapshot);
      });
    };
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // No snapshot yet (still loading, or the Worker's unreachable) — stay
  // silent rather than show a placeholder; this bar is a convenience, not
  // something that should ever block or clutter the screen.
  if (!usage) return null;

  // Skipped takes precedence over exceeded — a deliberate dev choice, not a
  // warning state, even if the session also happens to be over quota.
  const label = usage.devGenerationSkipped
    ? `🚫 Image generation skipped (dev) — ${usage.generatedThisSession} generated this session`
    : usage.quotaExceeded
      ? `⚠️ Image quota exceeded — ${usage.generatedThisSession} generated this session`
      : `Images this session: ${usage.generatedThisSession} (~${usage.estimatedDailyLimit}/day budget)`;

  const barStyle = usage.devGenerationSkipped ? styles.barSkipped : usage.quotaExceeded ? styles.barExceeded : styles.barNormal;
  const textStyle = usage.devGenerationSkipped ? styles.textSkipped : usage.quotaExceeded ? styles.textExceeded : styles.textNormal;

  return (
    <View style={[styles.bar, barStyle]}>
      <ThemedText type="small" style={[styles.text, textStyle]}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    marginBottom: Spacing.two,
  },
  barNormal: {
    backgroundColor: '#b8860b33',
  },
  barExceeded: {
    backgroundColor: '#d15c4f33',
  },
  barSkipped: {
    backgroundColor: '#6b728033',
  },
  text: {
    textAlign: 'center',
  },
  textNormal: {
    color: '#8a5a00',
  },
  textExceeded: {
    color: '#9a3226',
  },
  textSkipped: {
    color: '#4b5563',
  },
});
