import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { asc, eq } from 'drizzle-orm';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Location, type Item } from '@mobile-recipes/shared';

import { db, initDb } from '@db/client';
import { items as itemsTable } from '@db/schema';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LocationCard } from '@/components/location-card';
import { BottomSheet } from '@/components/bottom-sheet';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FloatingCTA } from '@/components/floating-cta';
import { Toast } from '@/components/toast';
import { PrimaryButton } from '@/components/primary-button';
import { Chip } from '@/components/chip';
import { Bookmark, Pencil } from '@/components/icons';
import { Radius, Spacing, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const LOCATION_ORDER: Location[] = ['freezer', 'heladera', 'alacena', 'condimentos', 'cajon'];

function loadItems(): Item[] {
  return db.select().from(itemsTable).orderBy(asc(itemsTable.name)).all() as Item[];
}

// No uuid dependency in the app — matches the pattern already used for
// saved_recipes ids (saved.tsx, detail/[id].tsx). Item ids are internal and
// never shown, so this is plenty unique for a single-device app.
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function KitchenScreen() {
  const { t } = useTranslation();
  const theme = useTheme();

  const [items, setItems] = useState<Item[]>([]);
  const [openLocation, setOpenLocation] = useState<Location | null>(null);
  // The chip a 2s long-press is asking to delete — non-null shows the
  // ConfirmDialog. Cleared on confirm, cancel, or backdrop tap.
  const [pendingDelete, setPendingDelete] = useState<Item | null>(null);
  // Whether the sheet's "Agregar" trigger has been swapped for its input —
  // reset whenever the sheet itself closes, see closeSheet below.
  const [addingNew, setAddingNew] = useState(false);
  const [draftName, setDraftName] = useState('');
  // Free text for things noticed but not in the list yet (e.g. "compré cherry y
  // un morrón") — sent verbatim as `notes` on the next request, not turned into
  // a persisted Item. Items need a location and this box deliberately doesn't
  // ask the user to pick one.
  const [notes, setNotes] = useState('');
  // Confirmation toast text, shown once when the notes field loses focus
  // (return key or tapping away both blur it) — the only feedback that the
  // text will be sent along with the next `Buscar ideas` tap. Not a modal:
  // principle 2 rules out anything that needs a tap to dismiss.
  const [notesConfirmation, setNotesConfirmation] = useState<string | null>(null);

  useEffect(() => {
    initDb();
    setItems(loadItems());
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<Location, Item[]>();
    for (const location of LOCATION_ORDER) map.set(location, []);
    for (const item of items) map.get(item.location)?.push(item);
    return map;
  }, [items]);

  const activeCount = useMemo(() => items.filter((item) => item.active).length, [items]);

  function toggleItem(item: Item) {
    const nextActive = !item.active;
    db.update(itemsTable).set({ active: nextActive }).where(eq(itemsTable.id, item.id)).run();
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, active: nextActive } : i)));
    Haptics.selectionAsync().catch(() => {});
  }

  // Active by default — you're adding it because you have it (principle 2:
  // mistakes are cheap, one tap to deactivate). Deliberately no duplicate-name
  // check — same principle, not worth building validation machinery for.
  function addItem(location: Location, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const newItem: Item = { id: generateId(), name: trimmed, location, active: true };
    db.insert(itemsTable).values(newItem).run();
    setItems((prev) => [...prev, newItem]);
    Haptics.selectionAsync().catch(() => {});
  }

  function deleteItem(item: Item) {
    db.delete(itemsTable).where(eq(itemsTable.id, item.id)).run();
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }

  function announceNotes() {
    const trimmed = notes.trim();
    if (!trimmed) return;
    setNotesConfirmation(t('kitchen.notesConfirmation', { text: trimmed }));
  }

  function closeSheet() {
    setOpenLocation(null);
    setAddingNew(false);
    setDraftName('');
    setPendingDelete(null);
  }

  // The bento card's + button — skips straight to the input instead of
  // making the user open the sheet and then tap "Agregar" themselves.
  function openForAdd(location: Location) {
    setOpenLocation(location);
    setAddingNew(true);
  }

  const openItems = openLocation ? (grouped.get(openLocation) ?? []) : [];
  const openActive = openItems.filter((item) => item.active).length;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <ThemedText type="title">{t('kitchen.title')}</ThemedText>
            <Pressable style={styles.savedLink} onPress={() => router.push('/saved')}>
              <Bookmark size={14} color={theme.text} />
              <ThemedText type="link">{t('kitchen.viewSaved')}</ThemedText>
            </Pressable>
          </View>
          <View
            style={[
              styles.notes,
              { backgroundColor: theme.surface, borderColor: notes.trim() ? theme.accent : theme.border },
            ]}
          >
            <Pencil size={15} color={theme.textSecondary} />
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t('kitchen.notesPlaceholder')}
              placeholderTextColor={theme.textSecondary}
              returnKeyType="done"
              onBlur={announceNotes}
              style={[styles.notesInput, { color: theme.text }]}
            />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
          {LOCATION_ORDER.map((location) => (
            <LocationCard
              key={location}
              location={location}
              label={t(`location.${location}`)}
              items={grouped.get(location) ?? []}
              wide={location === 'cajon'}
              onPress={() => setOpenLocation(location)}
              onToggleItem={toggleItem}
              onAdd={() => openForAdd(location)}
            />
          ))}
        </ScrollView>

        <FloatingCTA
          label={t('kitchen.findIdeas', { count: activeCount })}
          onPress={() => router.push({ pathname: '/deck', params: { notes } })}
        />
        {notesConfirmation && (
          <Toast message={notesConfirmation} onDone={() => setNotesConfirmation(null)} />
        )}
      </SafeAreaView>

      <BottomSheet
        visible={openLocation !== null}
        onClose={closeSheet}
        title={
          openLocation
            ? `${t(`location.${openLocation}`)} · ${t('kitchen.locationCount', { active: openActive, total: openItems.length })}`
            : ''
        }
        footer={<PrimaryButton label={t('kitchen.sheetDone')} onPress={closeSheet} />}
        overlay={
          <ConfirmDialog
            visible={pendingDelete !== null}
            title={t('kitchen.deleteTitle', { name: pendingDelete?.name ?? '' })}
            body={t('kitchen.deleteBody')}
            confirmLabel={t('kitchen.deleteConfirm')}
            cancelLabel={t('kitchen.deleteCancel')}
            onCancel={() => setPendingDelete(null)}
            onConfirm={() => {
              if (pendingDelete) deleteItem(pendingDelete);
              setPendingDelete(null);
            }}
          />
        }
      >
        <View style={styles.sheetChips}>
          {openItems.map((item) => (
            <Chip
              key={item.id}
              label={item.name}
              active={item.active}
              onPress={() => toggleItem(item)}
              onLongPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                setPendingDelete(item);
              }}
              delayLongPress={2000}
            />
          ))}
          {addingNew ? (
            <View style={[styles.addInput, { borderColor: theme.accent }]}>
              <TextInput
                autoFocus
                value={draftName}
                onChangeText={setDraftName}
                placeholder={t('kitchen.addPlaceholder')}
                placeholderTextColor={theme.textSecondary}
                returnKeyType="done"
                style={[styles.addInputField, { color: theme.text }]}
                onSubmitEditing={() => {
                  if (openLocation) addItem(openLocation, draftName);
                  setDraftName('');
                }}
              />
            </View>
          ) : (
            <Chip label={t('kitchen.add')} active={false} dashed onPress={() => setAddingNew(true)} />
          )}
        </View>
      </BottomSheet>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  header: {
    gap: Spacing.three,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  savedLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingTop: Spacing.two,
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  sheetChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  // Sized to match Chip's "full" variant so the input sits in the wrapped
  // row exactly like the chips around it.
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
});
