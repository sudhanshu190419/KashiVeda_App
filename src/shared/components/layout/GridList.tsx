import React from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme';

export interface GridListProps<T> {
  data: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T, index: number) => string;
  numColumns?: number; // default 2
  spacing?: number;
  emptyComponent?: React.ReactNode;
  scrollEnabled?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}

/**
 * GridList — Generic multi-column layout component for Kashi Veda mobile.
 *
 * Enforces:
 * - Generic type safety <T> for Pujas, Pandits, Kundli charts, Ghats, etc.
 * - VirtualizedList optimization when scrollEnabled is true
 * - Chunked non-virtualized row rendering when scrollEnabled is false (prevents nested ScrollView warnings)
 * - Strict spacing and padding token grounding
 */
export function GridList<T>({
  data,
  renderItem,
  keyExtractor,
  numColumns = 2,
  spacing: customSpacing,
  emptyComponent,
  scrollEnabled = true,
  contentContainerStyle,
  style,
}: GridListProps<T>): React.ReactElement {
  const { spacing } = useTheme();
  const gap = customSpacing ?? spacing.md;

  if (data.length === 0) {
    return (
      <View style={[styles.emptyContainer, style]}>
        {emptyComponent || null}
      </View>
    );
  }

  // When scrollEnabled is false, render plain Flexbox rows to avoid nested VirtualizedList warnings
  if (!scrollEnabled) {
    const rows: T[][] = [];
    for (let i = 0; i < data.length; i += numColumns) {
      rows.push(data.slice(i, i + numColumns));
    }

    return (
      <View style={[styles.container, contentContainerStyle, style]}>
        {rows.map((row, rowIndex) => {
          const isLastRow = rowIndex === rows.length - 1;
          const spacerSlots = numColumns - row.length;

          return (
            <View
              key={`grid-row-${rowIndex}`}
              style={[
                styles.row,
                {
                  gap,
                  marginBottom: isLastRow ? 0 : gap,
                },
              ]}
            >
              {row.map((item, itemColIndex) => {
                const itemIndex = rowIndex * numColumns + itemColIndex;
                const key = keyExtractor(item, itemIndex);
                return (
                  <View key={key} style={styles.gridItem}>
                    {renderItem(item, itemIndex)}
                  </View>
                );
              })}

              {/* Pad incomplete last row with empty flex views to preserve equal column widths */}
              {spacerSlots > 0 &&
                Array.from({ length: spacerSlots }).map((_, slotIndex) => (
                  <View key={`spacer-slot-${slotIndex}`} style={styles.gridItem} />
                ))}
            </View>
          );
        })}
      </View>
    );
  }

  // When scrollEnabled is true, use optimized FlatList
  return (
    <FlatList<T>
      key={`grid-columns-${numColumns}`}
      data={data}
      keyExtractor={keyExtractor}
      numColumns={numColumns}
      scrollEnabled={true}
      showsVerticalScrollIndicator={false}
      style={[styles.container, style]}
      contentContainerStyle={contentContainerStyle}
      columnWrapperStyle={{
        gap,
        marginBottom: gap,
      }}
      renderItem={({ item, index }) => (
        <View style={styles.gridItem}>
          {renderItem(item, index)}
        </View>
      )}
      ListEmptyComponent={emptyComponent ? <View>{emptyComponent}</View> : undefined}
    />
  );
}

export default GridList;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    width: '100%',
  },
  gridItem: {
    flex: 1,
  },
  emptyContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
