import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FloatingCTA } from '@/components/floating-cta';
import { BottomSheet } from '@/components/bottom-sheet';
import { PrimaryButton } from '@/components/primary-button';
import { CheckCircle, OpenCircle, Pencil, Plus, Search, XIcon } from '@/components/icons';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import { Radius, Spacing, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Theme = ReturnType<typeof useTheme>;

// PROTOTYPE — throwaway, resolving wayfinder ticket "Repostería pantry page
// UI/UX prototype" (github.com/nicojav/mobile-recipes-ai/issues/4), a child
// of the "Repostería: baked goods section" map (issue #2). ROUND 2 — the
// first round (four chip/pill-grid variants) was rejected: "too many pills,
// the pill element itself doesn't feel good here." This round drops Chip
// entirely and tries three genuinely different interaction models instead.
// Deliberately no pill-radius (999) anywhere below. Variant A won that round
// ("good, but needs more work — an image or icon per ingredient for better
// visualization"); it now carries a leading per-row glyph plus a trailing
// check as a clearer selected/unselected state. Not wired to Drizzle or
// i18next — plain in-memory mock state and hardcoded es-AR copy. See
// .claude/skills/prototype/UI.md §6 for the capture-and-discard plan once a
// direction is picked.

// Stand-ins for "does a visual per row help scanning" — plain emoji, not
// this app's real thin-line icon vocabulary (Design.md explicitly rejects
// emoji as a style choice elsewhere in the app: "those were always a
// placeholder for 'no icon library,' not a style choice"). If this wins,
// these get replaced by proper category icons or real ingredient photos.
// Deliberately keyed by seed name only — quick-added items are always
// free text, so they can never have curated art; the letter-monogram
// fallback in ItemAvatar below is a real constraint of this direction; not
// a prototype shortcut.
const ITEM_GLYPH: Record<string, string> = {
  'harina 0000': '🌾',
  'harina leudante': '🌾',
  'azúcar': '🍬',
  'azúcar impalpable': '❄️',
  'manteca': '🧈',
  'huevos': '🥚',
  'levadura seca': '🫙',
  'polvo de hornear': '✨',
  'esencia de vainilla': '🧴',
  'leche': '🥛',
  'dulce de leche': '🍯',
  'chocolate cobertura': '🍫',
  'cacao amargo': '🟫',
  'coco rallado': '🥥',
  'ralladura de limón': '🍋',
  'canela': '🍂',
  'nuez moscada': '🌰',
  'pasas de uva': '🍇',
  'nueces': '🥜',
};

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

  const toggle = (id: string) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, active: !it.active } : it)));
  };

  const add = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setItems((prev) => [{ id: `new-${Date.now()}`, name: trimmed, active: true }, ...prev]);
  };

  return { items, toggle, add };
}

// Leading per-row visual: curated glyph when the item has one (ITEM_GLYPH),
// otherwise a letter monogram — the fallback quick-added items always hit.
// Dimmed when inactive so the row's selected state reads at a glance
// without relying on text color alone.
function ItemAvatar({ item, theme }: { item: PantryItem; theme: Theme }) {
  const glyph = ITEM_GLYPH[item.name];
  return (
    <View
      style={[
        styles.avatar,
        { backgroundColor: item.active ? theme.accentTint : theme.background, borderColor: item.active ? theme.accentTint : theme.border },
      ]}
    >
      {glyph ? (
        <ThemedText style={[styles.avatarGlyph, !item.active && styles.avatarDim]}>{glyph}</ThemedText>
      ) : (
        <ThemedText type="smallBold" style={{ color: item.active ? theme.accentText : theme.textSecondary }}>
          {item.name[0]?.toUpperCase()}
        </ThemedText>
      )}
    </View>
  );
}

// --- Variant A: checklist. The most conventional reading of "toggle which
// of ~19 known things you have" — a scannable vertical list, not a wall.
// Quick-add lives inline: typing something with no match surfaces an
// "Agregar" row at the top of the same list, so there's only ever one
// control to look at, not a separate add affordance.
function VariantA() {
  const theme = useTheme();
  const { items, toggle, add } = useMockPantry();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  const exactMatch = q ? items.some((i) => i.name.toLowerCase() === q) : true;

  function addFromQuery() {
    if (!q || exactMatch) return;
    add(query);
    setQuery('');
  }

  return (
    <>
      <ThemedText type="title">Repostería</ThemedText>
      <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: query.trim() ? theme.accent : theme.border }]}>
        <Pencil size={15} color={theme.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscá o agregá un ingrediente"
          placeholderTextColor={theme.textSecondary}
          returnKeyType="done"
          onSubmitEditing={addFromQuery}
          style={[styles.searchInput, { color: theme.text }]}
        />
      </View>
      <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {!exactMatch && q.length > 0 && (
          <Pressable
            style={[styles.row, filtered.length > 0 && styles.rowDivider, { borderBottomColor: theme.border }]}
            onPress={addFromQuery}
          >
            <Plus size={18} color={theme.accent} />
            <ThemedText style={{ color: theme.accent }}>Agregar &quot;{query.trim()}&quot;</ThemedText>
          </Pressable>
        )}
        {filtered.map((item, i) => (
          <Pressable
            key={item.id}
            style={[styles.row, i < filtered.length - 1 && styles.rowDivider, { borderBottomColor: theme.border }]}
            onPress={() => toggle(item.id)}
          >
            <ItemAvatar item={item} theme={theme} />
            <ThemedText themeColor={item.active ? 'text' : 'textSecondary'} style={styles.rowGrow}>
              {item.name}
            </ThemedText>
            {item.active ? <CheckCircle size={18} color={theme.accent} /> : <OpenCircle size={18} color={theme.border} />}
          </Pressable>
        ))}
        {filtered.length === 0 && exactMatch && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
            Sin resultados.
          </ThemedText>
        )}
      </View>
    </>
  );
}

// --- Variant B: search-first composer. Flips the model entirely — instead
// of toggling from a full known list, you type and the catalog suggests;
// picking one moves it into "Tenés esto" below. The full inactive catalog
// is never shown as a browsable wall, only your active subset is — the bet
// is that composing a short list by typing feels lighter than scanning 19
// things to find the 5 you actually have.
function VariantB() {
  const theme = useTheme();
  const { items, toggle, add } = useMockPantry();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const suggestions = q ? items.filter((i) => !i.active && i.name.toLowerCase().includes(q)).slice(0, 5) : [];
  const exactMatch = q ? items.some((i) => i.name.toLowerCase() === q) : true;
  const activeItems = items.filter((i) => i.active);

  function pick(item: PantryItem) {
    toggle(item.id);
    setQuery('');
  }

  function addFromQuery() {
    if (!q || exactMatch) return;
    add(query);
    setQuery('');
  }

  return (
    <>
      <ThemedText type="title">Repostería</ThemedText>
      <View style={styles.searchAnchor}>
        <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: query.trim() ? theme.accent : theme.border }]}>
          <Search size={15} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscá o agregá un ingrediente"
            placeholderTextColor={theme.textSecondary}
            returnKeyType="done"
            onSubmitEditing={addFromQuery}
            style={[styles.searchInput, { color: theme.text }]}
          />
        </View>
        {q.length > 0 && (
          <View style={[styles.dropdown, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {!exactMatch && (
              <Pressable style={styles.dropdownRow} onPress={addFromQuery}>
                <Plus size={16} color={theme.accent} />
                <ThemedText style={{ color: theme.accent }}>Agregar &quot;{query.trim()}&quot;</ThemedText>
              </Pressable>
            )}
            {suggestions.map((item) => (
              <Pressable key={item.id} style={styles.dropdownRow} onPress={() => pick(item)}>
                <Plus size={16} color={theme.textSecondary} />
                <ThemedText>{item.name}</ThemedText>
              </Pressable>
            ))}
            {suggestions.length === 0 && exactMatch && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.dropdownEmpty}>
                Ya la tenés agregada.
              </ThemedText>
            )}
          </View>
        )}
      </View>

      <ThemedText type="micro" themeColor="textSecondary" style={styles.sectionLabel}>
        TENÉS ESTO ({activeItems.length})
      </ThemedText>
      <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {activeItems.map((item, i) => (
          <View key={item.id} style={[styles.row, i < activeItems.length - 1 && styles.rowDivider, { borderBottomColor: theme.border }]}>
            <ThemedText style={styles.rowGrow}>{item.name}</ThemedText>
            <Pressable hitSlop={8} onPress={() => toggle(item.id)}>
              <XIcon size={14} color={theme.textSecondary} />
            </Pressable>
          </View>
        ))}
        {activeItems.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
            Todavía no agregaste nada.
          </ThemedText>
        )}
      </View>
    </>
  );
}

// --- Variant C: icon-tile grid. A "pick your ingredients" selection screen
// (the onboarding-tile pattern), not a text-driven list — bigger, deliberate
// touch targets instead of dense inline tokens. Quick-add is a modal (the
// existing BottomSheet) via a trailing "+" tile, a genuinely different
// affordance from A/B's inline patterns.
function VariantC() {
  const theme = useTheme();
  const { items, toggle, add } = useMockPantry();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState('');

  function submitAdd() {
    if (!draft.trim()) return;
    add(draft);
    setDraft('');
    setSheetOpen(false);
  }

  return (
    <>
      <ThemedText type="title">Repostería</ThemedText>
      <View style={styles.tileGrid}>
        {items.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => toggle(item.id)}
            style={[styles.tile, { borderColor: item.active ? theme.accent : theme.border, backgroundColor: item.active ? theme.accent : theme.surface }]}
          >
            <View style={[styles.monogram, { backgroundColor: item.active ? 'rgba(255,255,255,0.22)' : theme.accentTint }]}>
              <ThemedText type="smallBold" style={{ color: item.active ? '#FFFFFF' : theme.accentText }}>
                {item.name[0]?.toUpperCase()}
              </ThemedText>
            </View>
            <ThemedText type="small" numberOfLines={2} style={[styles.tileLabel, { color: item.active ? '#FFFFFF' : theme.text }]}>
              {item.name}
            </ThemedText>
          </Pressable>
        ))}
        <Pressable onPress={() => setSheetOpen(true)} style={[styles.tile, styles.addTile, { borderColor: theme.accent }]}>
          <Plus size={20} color={theme.accent} />
          <ThemedText type="small" style={{ color: theme.accent }}>
            Agregar
          </ThemedText>
        </Pressable>
      </View>

      <BottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Agregar ingrediente"
        footer={<PrimaryButton label="Agregar" onPress={submitAdd} disabled={!draft.trim()} />}
      >
        <TextInput
          autoFocus
          value={draft}
          onChangeText={setDraft}
          placeholder="¿Qué agregás?"
          placeholderTextColor={theme.textSecondary}
          returnKeyType="done"
          onSubmitEditing={submitAdd}
          style={[styles.sheetInput, { color: theme.text, borderColor: theme.border }]}
        />
      </BottomSheet>
    </>
  );
}

const VARIANTS = [
  { key: 'A', name: 'Lista con check' },
  { key: 'B', name: 'Buscá y armá' },
  { key: 'C', name: 'Grilla de fichas' },
];

export default function PrototypeReposteria() {
  const { variant: variantParam } = useLocalSearchParams<{ variant?: string }>();
  const variant = variantParam ?? 'A';

  const setVariant = (key: string) => router.setParams({ variant: key });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.scroll}>
          {variant === 'A' && <VariantA />}
          {variant === 'B' && <VariantB />}
          {variant === 'C' && <VariantC />}
        </View>
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
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    flex: 1,
  },
  searchAnchor: {
    position: 'relative',
    zIndex: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.small,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: Spacing.one,
    borderRadius: Radius.small,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  dropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  dropdownEmpty: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    textAlign: 'center',
  },
  listCard: {
    borderRadius: Radius.small,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - 2,
  },
  rowDivider: {
    borderBottomWidth: 1,
  },
  rowGrow: {
    flex: 1,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGlyph: {
    fontSize: 18,
    lineHeight: 22,
  },
  avatarDim: {
    opacity: 0.35,
  },
  emptyText: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    textAlign: 'center',
  },
  sectionLabel: {
    marginTop: -Spacing.one,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two + 2,
  },
  tile: {
    flexBasis: '30%',
    flexGrow: 1,
    aspectRatio: 1,
    borderRadius: Radius.small + 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
  },
  addTile: {
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  monogram: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    textAlign: 'center',
  },
  sheetInput: {
    borderRadius: Radius.small,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 15,
  },
});
