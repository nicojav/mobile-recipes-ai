import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Circle, Path, Rect, Svg } from 'react-native-svg';

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
// visualization"); it now carries a leading per-row icon plus a trailing
// check as a clearer selected/unselected state. The icons started as
// placeholder emoji, then got swapped for real hand-drawn vectors in this
// app's own thin-line vocabulary once asked to "see it in action" — see
// IngredientIcon below. Not wired to Drizzle or i18next — plain in-memory
// mock state and hardcoded es-AR copy. See
// .claude/skills/prototype/UI.md §6 for the capture-and-discard plan once a
// direction is picked.

// Real icons, not a stand-in — same 1.5-stroke/24-viewBox/round-cap
// vocabulary as icons.tsx (see Design.md's "Icon set" section), just kept
// local to this prototype until a direction wins. Deliberately category
// shapes, not literal photos: "flourBag" covers both flours, etc.
// Quick-added items are always free text, so they can never have curated
// art — the letter-monogram fallback in ItemAvatar below is a real
// constraint of this direction, not a prototype shortcut.
type IngredientIconKind =
  | 'flourBag'
  | 'sugar'
  | 'poweredSugar'
  | 'butter'
  | 'egg'
  | 'yeast'
  | 'bakingPowder'
  | 'vanilla'
  | 'milk'
  | 'dulceDeLeche'
  | 'chocolate'
  | 'cacao'
  | 'coconut'
  | 'lemon'
  | 'cinnamon'
  | 'nutmeg'
  | 'raisins'
  | 'walnut';

const ITEM_ICON: Record<string, IngredientIconKind> = {
  'harina 0000': 'flourBag',
  'harina leudante': 'flourBag',
  'azúcar': 'sugar',
  'azúcar impalpable': 'poweredSugar',
  'manteca': 'butter',
  'huevos': 'egg',
  'levadura seca': 'yeast',
  'polvo de hornear': 'bakingPowder',
  'esencia de vainilla': 'vanilla',
  'leche': 'milk',
  'dulce de leche': 'dulceDeLeche',
  'chocolate cobertura': 'chocolate',
  'cacao amargo': 'cacao',
  'coco rallado': 'coconut',
  'ralladura de limón': 'lemon',
  'canela': 'cinnamon',
  'nuez moscada': 'nutmeg',
  'pasas de uva': 'raisins',
  'nueces': 'walnut',
};

const ICON_STROKE = 1.5;

function IngredientIcon({ kind, size = 18, color }: { kind: IngredientIconKind; size?: number; color: string }) {
  const p = { stroke: color, strokeWidth: ICON_STROKE, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {kind === 'flourBag' && (
        <>
          <Path d="M9 8V6a3 3 0 0 1 6 0v2" {...p} />
          <Path d="M8 8h8l1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2l1-11z" {...p} />
        </>
      )}
      {kind === 'sugar' && (
        <>
          <Path d="M4 18h16" {...p} />
          <Path d="M7 18c0-4 2-8 5-8s5 4 5 8" {...p} />
          <Circle cx="10.5" cy="13.5" r="0.6" fill={color} />
          <Circle cx="13.5" cy="11.5" r="0.6" fill={color} />
          <Circle cx="14.5" cy="14.5" r="0.6" fill={color} />
        </>
      )}
      {kind === 'poweredSugar' && (
        <>
          <Circle cx="12" cy="9" r="5" {...p} />
          <Path d="M7.5 9h9M12 4.5v9" {...p} />
          <Path d="M9 16l-1 3M12 16v3M15 16l1 3" {...p} />
        </>
      )}
      {kind === 'butter' && (
        <>
          <Rect x="5" y="9" width="14" height="8" rx="1.5" {...p} />
          <Path d="M8 9V7.5C8 6.7 8.9 6 10 6h4c1.1 0 2 .7 2 1.5V9" {...p} />
          <Path d="M5 13h14" {...p} />
        </>
      )}
      {kind === 'egg' && <Path d="M12 3C9 7 6 11.5 6 15a6 6 0 0 0 12 0c0-3.5-3-8-6-12z" {...p} />}
      {kind === 'yeast' && (
        <>
          <Rect x="7" y="6" width="10" height="3" rx="1" {...p} />
          <Rect x="8" y="9" width="8" height="10" rx="1.5" {...p} />
          <Path d="M10 12.5h4M10 15.5h4" {...p} />
        </>
      )}
      {kind === 'bakingPowder' && (
        <>
          <Path d="M6 7c0-1.1 2.7-2 6-2s6 .9 6 2-2.7 2-6 2-6-.9-6-2z" {...p} />
          <Path d="M6 7v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7" {...p} />
        </>
      )}
      {kind === 'vanilla' && (
        <>
          <Path d="M10.5 3h3v3l1.5 1.5c.3.3.5.8.5 1.2v9.8a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2V8.7c0-.4.2-.9.5-1.2L10.5 6V3z" {...p} />
          <Path d="M9.5 13h5" {...p} />
        </>
      )}
      {kind === 'milk' && (
        <>
          <Path d="M8 4h8l1 3v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7l1-3z" {...p} />
          <Path d="M8 4l4 3 4-3" {...p} />
        </>
      )}
      {kind === 'dulceDeLeche' && (
        <>
          <Path d="M7 7a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v2H7V7z" {...p} />
          <Path d="M7 9h10v9a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3V9z" {...p} />
        </>
      )}
      {kind === 'chocolate' && (
        <>
          <Rect x="5" y="7" width="14" height="10" rx="1" {...p} />
          <Path d="M9 7v10M13.5 7v10M5 12h14" {...p} />
        </>
      )}
      {kind === 'cacao' && (
        <>
          <Path d="M4 17c0-3.5 3-6 8-6s8 2.5 8 6" {...p} />
          <Path d="M4 17h16" {...p} />
          <Path d="M9 13c1-1 2-1 3 0s2 1 3 0" {...p} />
        </>
      )}
      {kind === 'coconut' && (
        <>
          <Path d="M4 13a8 5.5 0 0 1 16 0" {...p} />
          <Path d="M4 13h16" {...p} />
          <Path d="M7.5 13c.4-1.8 1.3-2.8 1.8-3M11.5 13c.2-2 .7-3 .7-3M15.5 13c-.4-1.8-1.3-2.8-1.8-3" {...p} />
        </>
      )}
      {kind === 'lemon' && (
        <>
          <Path d="M4 12.5c0-3.6 3.6-6.5 8-6.5s8 2.9 8 6.5-3.6 6.5-8 6.5-8-2.9-8-6.5z" {...p} />
          <Path d="M12.5 6c.3-1.4 1.7-2 2.8-1.8" {...p} />
        </>
      )}
      {kind === 'cinnamon' && <Path d="M7.5 4c-2 3.3-2 12.7 0 16M11 4c-1.3 3.3-1.3 12.7 0 16M14.5 4c-2 3.3-2 12.7 0 16" {...p} />}
      {kind === 'nutmeg' && (
        <>
          <Path d="M7 12a5 6 0 1 1 10 0 5 6 0 0 1-10 0z" {...p} />
          <Circle cx="10" cy="10" r="0.5" fill={color} />
          <Circle cx="13.5" cy="9.3" r="0.5" fill={color} />
          <Circle cx="10.8" cy="14" r="0.5" fill={color} />
          <Circle cx="14" cy="13" r="0.5" fill={color} />
        </>
      )}
      {kind === 'raisins' && (
        <>
          <Path d="M11 5.5c0-1 1-1.8 2-1.8s2 .8 2 1.8" {...p} />
          <Path d="M12 7.5v3" {...p} />
          <Circle cx="9.3" cy="14" r="2.2" {...p} />
          <Circle cx="14.2" cy="15" r="2.2" {...p} />
          <Circle cx="11.8" cy="11" r="2.2" {...p} />
        </>
      )}
      {kind === 'walnut' && (
        <>
          <Path d="M6 12a6 7 0 1 1 12 0 6 7 0 0 1-12 0z" {...p} />
          <Path d="M9 8c1 2 0 3 1.5 4S10 14 11.5 15.5M15 8c-1 2 0 3-1.5 4S14 14 12.5 15.5" {...p} />
        </>
      )}
    </Svg>
  );
}

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

// Leading per-row visual: the real icon when the item has one (ITEM_ICON),
// otherwise a letter monogram — the fallback quick-added items always hit.
// Dimmed when inactive so the row's selected state reads at a glance
// without relying on text color alone.
function ItemAvatar({ item, theme }: { item: PantryItem; theme: Theme }) {
  const kind = ITEM_ICON[item.name];
  const iconColor = item.active ? theme.accentText : theme.textSecondary;
  return (
    <View
      style={[
        styles.avatar,
        { backgroundColor: item.active ? theme.accentTint : theme.background, borderColor: item.active ? theme.accentTint : theme.border },
        !item.active && styles.avatarDim,
      ]}
    >
      {kind ? (
        <IngredientIcon kind={kind} size={19} color={iconColor} />
      ) : (
        <ThemedText type="smallBold" style={{ color: iconColor }}>
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
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
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
  scrollContainer: {
    flex: 1,
  },
  scroll: {
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
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
  avatarDim: {
    opacity: 0.55,
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
