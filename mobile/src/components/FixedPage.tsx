import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent, type StyleProp, type ViewStyle, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveSafeHorizontalPadding } from '../layout/adaptiveLayout';
import { useAppTheme } from '../theme';
import { SCREEN_CONTENT_WIDTHS, SCREEN_WIDE_LAYOUT_BREAKPOINT } from './Screen';

const LARGE_TEXT_SCALE = 1.6; // Intrinsic layout keeps enlarged labels and actions fully reachable.
const SHORT_PROGRESS_HEIGHT = 520; // Below this remaining shell height, a complete chart needs page scrolling.
const TEXT_PROBE_SIZE = 16; // Measures browser text enlargement, which does not update native fontScale.

type FixedPageLayout = { expanded: boolean };
const ColumnStyleContext = React.createContext<StyleProp<ViewStyle>>(undefined);

/** Constrain copy inside an edge-to-edge interaction surface without shrinking its hit target. */
export function FixedPageColumn({ style, ...props }: ViewProps) {
    return <View {...props} style={[styles.column, React.useContext(ColumnStyleContext), style]} />;
}
type FixedPageProps = {
    context?: React.ReactNode;
    children: React.ReactNode | ((layout: FixedPageLayout) => React.ReactNode);
    footer?: React.ReactNode | ((layout: FixedPageLayout) => React.ReactNode);
    scrollWhenShort?: boolean;
    intrinsicBody?: boolean;
    minBodyHeight?: number;
    contentWidth?: 'overview' | 'wide';
    fullWidthBody?: boolean;
    fullWidthFooter?: boolean;
    testID?: string;
};

/** A full-page composition within the measured app shell; tabs already own the bottom inset. */
export function FixedPage({ context, children, footer, scrollWhenShort = false, intrinsicBody = false, minBodyHeight = 120, contentWidth = 'overview', fullWidthBody = false, fullWidthFooter = false, testID }: FixedPageProps) {
    const theme = useAppTheme();
    const insets = useSafeAreaInsets();
    const { width, fontScale } = useWindowDimensions();
    const [height, setHeight] = React.useState(0);
    const [scrollHeight, setScrollHeight] = React.useState(0);
    const [contextHeight, setContextHeight] = React.useState(0);
    const [webTextScale, setWebTextScale] = React.useState(1);
    const probe = React.useRef<Text>(null);
    const readTextScale = React.useCallback(() => {
        if (Platform.OS !== 'web' || typeof window === 'undefined') return;
        const element = probe.current as unknown as HTMLElement | null;
        if (element) setWebTextScale(Number.parseFloat(window.getComputedStyle(element).fontSize) / TEXT_PROBE_SIZE);
    }, []);
    React.useLayoutEffect(readTextScale, [readTextScale, width]);
    const expanded = Math.max(fontScale, webTextScale) >= LARGE_TEXT_SCALE
        || (scrollWhenShort && height > 0 && height < SHORT_PROGRESS_HEIGHT);
    const horizontalPadding = resolveSafeHorizontalPadding(
        width >= SCREEN_WIDE_LAYOUT_BREAKPOINT ? theme.spacing.xl : theme.spacing.lg,
        insets.left, insets.right, theme.spacing.sm
    );
    const columnStyle = [styles.column, { maxWidth: SCREEN_CONTENT_WIDTHS[contentWidth] }, horizontalPadding];
    const updateHeight = (event: LayoutChangeEvent) => setHeight(event.nativeEvent.layout.height);
    const naturalHeight = contextHeight + minBodyHeight;
    const contentHeight = Math.max(scrollHeight, naturalHeight);
    const footerContent = typeof footer === 'function' ? footer({ expanded }) : footer;

    return <ColumnStyleContext.Provider value={columnStyle}><View testID={testID} style={[styles.root, { backgroundColor: theme.colors.background }]} onLayout={updateHeight}>
        {Platform.OS === 'web' && <Text ref={probe} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" onLayout={readTextScale} style={styles.probe}>M</Text>}
        <ScrollView
            role="main"
            testID="fixed-page-scroll"
            style={styles.scroller}
            contentContainerStyle={[styles.scrollContent, !expanded && scrollHeight > 0 && (intrinsicBody
                ? { minHeight: contentHeight }
                : { height: contentHeight })]}
            onLayout={(event) => { setScrollHeight(event.nativeEvent.layout.height); readTextScale(); }}
            keyboardShouldPersistTaps="handled"
        >
            {context && <View style={{ backgroundColor: theme.colors.summaryContainer }} onLayout={(event) => setContextHeight(event.nativeEvent.layout.height)}>
                <View style={columnStyle}>{context}</View>
            </View>}
            <View style={[!fullWidthBody && columnStyle, styles.body, { minHeight: minBodyHeight }, expanded && styles.bodyExpanded, intrinsicBody && styles.bodyIntrinsic]}>
                {typeof children === 'function' ? children({ expanded }) : children}
            </View>
            {expanded && footerContent && <View style={[styles.footer, { borderTopColor: theme.colors.outline }]}><View style={!fullWidthFooter && columnStyle}>{footerContent}</View></View>}
        </ScrollView>
        {!expanded && footerContent && <View style={[styles.footer, { borderTopColor: theme.colors.outline }]}><View style={!fullWidthFooter && columnStyle}>{footerContent}</View></View>}
    </View></ColumnStyleContext.Provider>;
}

const styles = StyleSheet.create({
    root: { flex: 1, minHeight: 0 },
    scroller: { flex: 1, minHeight: 0 },
    scrollContent: { flexGrow: 1 },
    column: { width: '100%', alignSelf: 'center', minWidth: 0 },
    body: { flex: 1 },
    bodyExpanded: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
    // Summary rows set their own height; unused space still belongs to the full-width body.
    bodyIntrinsic: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto' },
    footer: { flexShrink: 0, borderTopWidth: StyleSheet.hairlineWidth },
    probe: { position: 'absolute', opacity: 0, fontSize: TEXT_PROBE_SIZE, pointerEvents: 'none' }
});
