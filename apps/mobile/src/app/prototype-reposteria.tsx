import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Circle, Path, Svg } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FloatingCTA } from '@/components/floating-cta';
import { Chip } from '@/components/chip';
import { Bookmark, CalendarIcon, Pencil } from '@/components/icons';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import { Radius, Spacing, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Theme = ReturnType<typeof useTheme>;

// PROTOTYPE — throwaway, resolving wayfinder ticket "Repostería pantry page
// UI/UX prototype" (github.com/nicojav/mobile-recipes-ai/issues/4), a child
// of the "Repostería: baked goods section" map (issue #2). Structurally
// different takes on the flat baking-pantry page, switchable via ?variant=.
// A/B/C were the first round; rejected as too much surrounding structure
// around the chips (header mocks, sections, a toggle). D is the follow-up:
// no chrome at all, just the pill grid. Not wired to Drizzle or i18next —
// plain in-memory mock state and hardcoded es-AR copy, since the question
// here is layout and interaction, not persistence or final strings. See
// .claude/skills/prototype/UI.md §6 for the capture-and-discard plan once a
// direction is picked.

const SEED_NAMES = [
  'harina 0000',
  'harina leudante',
  'azúcar',
  'azúcar impalpable',
  'manteca',
  'huevos',
  'levadura seca',
  'polvo de hornear',
  'esencia de vainilla',
  'leche',
  'dulce de leche',
  'chocolate cobertura',
  'cacao amargo',
  'coco rallado',
  'ralladura de limón',
  'canela',
  'nuez moscada',
  'pasas de uva',
  'nueces',
];

type PantryItem = { id: string; name: string; active: boolean };

function useMockPantry() {
  const [items, setItems] = useState<PantryItem[]>(() =>
    SEED_NAMES.map((name, i) => ({ id: String(i), name, active: true })),
  );

  const toggle = useCallback((id: string) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, active: !it.active } : it)));
  }, []);

  const add = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setItems((prev) => [{ id: `new-${Date.now()}`, name: trimmed, active: true }, ...prev]);
  }, []);

  return { items, toggle, add };
}

// Rolling pin, prototype-only — same 1.5-stroke/24-viewBox vocabulary as
// icons.tsx. Fold into that file if a variant using it wins.
function RollingPin({ size = 14, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 9h12a3 3 0 0 1 3 3 3 3 0 0 1-3 3H6a3 3 0 0 1-3-3 3 3 0 0 1 3-3z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M3 12H1M23 12h-2" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Circle cx="0.7" cy="12" r="0.7" fill={color} />
      <Circle cx="23.3" cy="12" r="0.7" fill={color} />
    </Svg>
  );
}

// Mock excerpt of Mi cocina's real title row (see index.tsx), so the nav
// entry point can be judged in context instead of floating alone. Inert —
// tapping does nothing, this is chrome for comparison, not a working screen.
function MiCocinaHeaderPreview({ theme, navEntry }: { theme: Theme; navEntry: React.ReactNode }) {
  return (
    <View style={[styles.headerPreview, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <ThemedText type="micro" themeColor="textSecondary">
        CONTEXTO — HEADER DE MI COCINA (INERTE)
      </ThemedText>
      <View style={styles.titleRow}>
        <ThemedText type="title">Mi cocina</ThemedText>
        <View style={styles.headerLinks}>
          <View style={styles.savedLink}>
            <CalendarIcon size={14} color={theme.textSecondary} />
            <ThemedText type="link" themeColor="textSecondary">
              Calendario
            </ThemedText>
          </View>
          {navEntry}
          <View style={styles.savedLink}>
            <Bookmark size={14} color={theme.textSecondary} />
            <ThemedText type="link" themeColor="textSecondary">
              Guardadas
            </ThemedText>
          </View>
        </View>
      </View>
    </View>
  );
}

// --- Variant A: literal flat wrap, trailing quick-add chip (mirrors the
// bottom-sheet's addInput/dashed-"Agregar" pattern from index.tsx, just
// promoted to the main page since Repostería has no per-location sheet). Nav
// entry: an icon+label link, same visual weight as the existing
// Calendario/Guardadas links. This is the closest reading of the ticket's
// literal ask — the baseline the other two argue against.
function VariantA() {
  const theme = useTheme();
  const { items, toggle, add } = useMockPantry();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const activeCount = items.filter((i) => i.active).length;

  return (
    <>
      <MiCocinaHeaderPreview
        theme={theme}
        navEntry={
          <View style={styles.savedLink}>
            <RollingPin size={14} color={theme.text} />
            <ThemedText type="link">Repostería</ThemedText>
          </View>
        }
      />
      <View style={styles.titleRow}>
        <ThemedText type="title">Repostería</ThemedText>
        <View style={[styles.countBadge, { backgroundColor: theme.accentTint }]}>
          <ThemedText type="small" style={{ color: theme.accentText }}>
            {activeCount}/{items.length}
          </ThemedText>
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.blurb}>
        Todo en un solo pozo, sin agrupar por lugar — como Mi cocina, pero sin cajones.
      </ThemedText>
      <View style={styles.chipWrap}>
        {items.map((item) => (
          <Chip key={item.id} label={item.name} active={item.active} onPress={() => toggle(item.id)} />
        ))}
        {adding ? (
          <View style={[styles.addInput, { borderColor: theme.accent }]}>
            <TextInput
              autoFocus
              value={draft}
              onChangeText={setDraft}
              placeholder="¿Qué agregás?"
              placeholderTextColor={theme.textSecondary}
              returnKeyType="done"
              style={[styles.addInputField, { color: theme.text }]}
              onSubmitEditing={() => {
                add(draft);
                setDraft('');
                setAdding(false);
              }}
            />
          </View>
        ) : (
          <Chip label="Agregar" active={false} dashed accent onPress={() => setAdding(true)} />
        )}
      </View>
    </>
  );
}

// --- Variant B: lightweight non-location grouping ("Usás seguido" pinned
// row) plus an always-visible top quick-add pill, echoing Mi cocina's notes
// pill affordance but wired to actually add an item rather than pass
// through as notes. Nav entry: a segmented Cocina/Repostería toggle
// replacing the plain title row — reads as one pantry with two modes rather
// than two same-weight destinations.
function VariantB() {
  const theme = useTheme();
  const { items, toggle, add } = useMockPantry();
  const [draft, setDraft] = useState('');

  const pinned = items.slice(0, 5);
  const rest = items.slice(5);
  const activeCount = items.filter((i) => i.active).length;

  return (
    <>
      <View style={[styles.headerPreview, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <ThemedText type="micro" themeColor="textSecondary">
          CONTEXTO — HEADER DE MI COCINA (INERTE)
        </ThemedText>
        <View style={[styles.segmented, { borderColor: theme.border }]}>
          <View style={[styles.segment, styles.segmentInactive]}>
            <ThemedText type="small" themeColor="textSecondary">
              Cocina
            </ThemedText>
          </View>
          <View style={[styles.segment, { backgroundColor: theme.accent }]}>
            <RollingPin size={13} color="#FFFFFF" />
            <ThemedText type="smallBold" style={styles.segmentActiveLabel}>
              Repostería
            </ThemedText>
          </View>
        </View>
      </View>

      <View style={styles.titleRow}>
        <ThemedText type="title">Repostería</ThemedText>
        <View style={[styles.countBadge, { backgroundColor: theme.accentTint }]}>
          <ThemedText type="small" style={{ color: theme.accentText }}>
            {activeCount}/{items.length}
          </ThemedText>
        </View>
      </View>

      <View style={[styles.notes, { backgroundColor: theme.surface, borderColor: draft.trim() ? theme.accent : theme.border }]}>
        <Pencil size={15} color={theme.textSecondary} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="¿Qué agregás a la repostería?"
          placeholderTextColor={theme.textSecondary}
          returnKeyType="done"
          style={[styles.notesInput, { color: theme.text }]}
          onSubmitEditing={() => {
            add(draft);
            setDraft('');
          }}
        />
      </View>

      <ThemedText type="micro" themeColor="textSecondary" style={styles.sectionLabel}>
        USÁS SEGUIDO
      </ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pinnedRow}>
        {pinned.map((item) => (
          <Chip key={item.id} label={item.name} active={item.active} accent={item.active} onPress={() => toggle(item.id)} />
        ))}
      </ScrollView>

      <ThemedText type="micro" themeColor="textSecondary" style={styles.sectionLabel}>
        TODO
      </ThemedText>
      <View style={styles.chipWrap}>
        {rest.map((item) => (
          <Chip key={item.id} label={item.name} active={item.active} onPress={() => toggle(item.id)} />
        ))}
      </View>
    </>
  );
}

// --- Variant C: one wide bento card (LocationCard's own visual language —
// solid tint fill standing in for the photo treatment, since there's no
// Repostería photo asset yet) holding the whole pantry, sectioned
// alphabetically as a byproduct of sorting rather than a designed taxonomy —
// testing whether *any* grouping reads better than a flat wrap at ~19
// chips. Nav entry: icon-only, no label — the minimal-real-estate option,
// on the theory this is a lower-frequency destination than Mi cocina.
function VariantC() {
  const theme = useTheme();
  const { items, toggle, add } = useMockPantry();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const activeCount = items.filter((i) => i.active).length;

  const sections = useMemo(() => {
    const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const map = new Map<string, PantryItem[]>();
    for (const item of sorted) {
      const letter = item.name[0]?.toUpperCase() ?? '#';
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(item);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <>
      <MiCocinaHeaderPreview
        theme={theme}
        navEntry={
          <Pressable style={styles.iconOnlyLink} hitSlop={8}>
            <RollingPin size={16} color={theme.textSecondary} />
          </Pressable>
        }
      />
      <View style={[styles.bentoCard, { backgroundColor: theme.accentTint, borderColor: theme.border }]}>
        <View style={styles.titleRow}>
          <ThemedText type="cardTitle">Repostería</ThemedText>
          <View style={[styles.countBadge, { backgroundColor: theme.surface }]}>
            <ThemedText type="small" style={{ color: theme.accentText }}>
              {activeCount}/{items.length}
            </ThemedText>
          </View>
        </View>
        {sections.map(([letter, group]) => (
          <View key={letter} style={styles.alphaSection}>
            <ThemedText type="micro" themeColor="textSecondary">
              {letter}
            </ThemedText>
            <View style={styles.chipWrap}>
              {group.map((item) => (
                <Chip key={item.id} label={item.name} active={item.active} onPress={() => toggle(item.id)} />
              ))}
            </View>
          </View>
        ))}
        {adding ? (
          <View style={[styles.addInput, { borderColor: theme.accent, backgroundColor: theme.surface }]}>
            <TextInput
              autoFocus
              value={draft}
              onChangeText={setDraft}
              placeholder="¿Qué agregás?"
              placeholderTextColor={theme.textSecondary}
              returnKeyType="done"
              style={[styles.addInputField, { color: theme.text }]}
              onSubmitEditing={() => {
                add(draft);
                setDraft('');
                setAdding(false);
              }}
            />
          </View>
        ) : (
          <Chip label="Agregar" active={false} dashed accent onPress={() => setAdding(true)} />
        )}
      </View>
    </>
  );
}

// --- Variant D: no chrome. Direct response to reacting to A/B/C as "too
// much surrounding structure, not the pills themselves" — everything beyond
// the title and the grid itself is gone: no header-context mock, no count
// badge, no blurb, no pinned row/bento wrapper/alpha sections/segmented
// toggle. Just the pill grid, generously spaced, as the whole page. Nav
// entry point is deliberately not re-explored here — settle the pantry
// surface itself first.
function VariantD() {
  const theme = useTheme();
  const { items, toggle, add } = useMockPantry();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const activeCount = items.filter((i) => i.active).length;

  return (
    <>
      <View style={styles.plainHeader}>
        <ThemedText type="title">Repostería</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {activeCount} de {items.length} activos
        </ThemedText>
      </View>
      <View style={styles.plainChipWrap}>
        {items.map((item) => (
          <Chip key={item.id} label={item.name} active={item.active} onPress={() => toggle(item.id)} />
        ))}
        {adding ? (
          <View style={[styles.addInput, { borderColor: theme.accent }]}>
            <TextInput
              autoFocus
              value={draft}
              onChangeText={setDraft}
              placeholder="¿Qué agregás?"
              placeholderTextColor={theme.textSecondary}
              returnKeyType="done"
              style={[styles.addInputField, { color: theme.text }]}
              onSubmitEditing={() => {
                add(draft);
                setDraft('');
                setAdding(false);
              }}
            />
          </View>
        ) : (
          <Chip label="Agregar" active={false} dashed accent onPress={() => setAdding(true)} />
        )}
      </View>
    </>
  );
}

const VARIANTS = [
  { key: 'D', name: 'Solo pills, sin chrome' },
  { key: 'A', name: 'Flat wrap' },
  { key: 'B', name: 'Pinned + top quick-add' },
  { key: 'C', name: 'Bento + alfabético' },
];

export default function PrototypeReposteria() {
  const { variant: variantParam } = useLocalSearchParams<{ variant?: string }>();
  const variant = variantParam ?? 'D';

  const setVariant = (key: string) => router.setParams({ variant: key });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {variant === 'D' && <VariantD />}
          {variant === 'A' && <VariantA />}
          {variant === 'B' && <VariantB />}
          {variant === 'C' && <VariantC />}
        </ScrollView>
        <FloatingCTA label="Buscar ideas de repostería" onPress={() => {}} />
      </SafeAreaView>
      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={setVariant} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scroll: {
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six + Spacing.six,
    gap: Spacing.three,
  },
  headerPreview: {
    borderRadius: Radius.small,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: Spacing.three,
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLinks: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  savedLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  iconOnlyLink: {
    padding: Spacing.one,
  },
  countBadge: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  blurb: {
    marginTop: -Spacing.two,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  addInput: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    minWidth: 120,
  },
  addInputField: {
    fontSize: 14,
    lineHeight: 20,
    padding: 0,
  },
  notes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  notesInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    borderWidth: 1,
    padding: 3,
    alignSelf: 'flex-start',
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  segmentInactive: {
    backgroundColor: 'transparent',
  },
  segmentActiveLabel: {
    color: '#FFFFFF',
  },
  sectionLabel: {
    marginTop: -Spacing.one,
  },
  pinnedRow: {
    gap: Spacing.two,
    paddingRight: Spacing.three,
  },
  bentoCard: {
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  alphaSection: {
    gap: Spacing.two,
  },
  plainHeader: {
    gap: Spacing.one,
  },
  plainChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
});
