package com.ai.assistance.operit.ui.features.chat.components

import androidx.compose.foundation.lazy.LazyListState as ComposeLazyListState
import com.ai.assistance.operit.ui.features.chat.components.lazy.LazyListState

/**
 * Scrolls to the actual end of the list so the trailing edge of the final item stays aligned with
 * the viewport's content end instead of its start.
 */
suspend fun LazyListState.animateScrollToEnd() {
    val lastIndex = layoutInfo.totalItemsCount - 1
    if (lastIndex < 0) {
        return
    }

    animateScrollToItem(lastIndex)

    val updatedLayoutInfo = layoutInfo
    val targetItemInfo =
        updatedLayoutInfo.visibleItemsInfo.lastOrNull { it.index == lastIndex } ?: return
    val contentViewportEnd =
        updatedLayoutInfo.viewportEndOffset - updatedLayoutInfo.afterContentPadding
    val targetItemEnd = targetItemInfo.offset + targetItemInfo.size
    if (targetItemEnd <= contentViewportEnd && !canScrollBackward) {
        return
    }

    val targetTopOffset = contentViewportEnd - targetItemInfo.size
    val targetScrollOffset = -targetTopOffset

    if (
        firstVisibleItemIndex != lastIndex ||
            firstVisibleItemScrollOffset != targetScrollOffset
    ) {
        scrollToItem(lastIndex, targetScrollOffset)
    }
}

suspend fun ComposeLazyListState.animateScrollToEnd() {
    val lastIndex = layoutInfo.totalItemsCount - 1
    if (lastIndex < 0) {
        return
    }

    animateScrollToItem(lastIndex)

    val updatedLayoutInfo = layoutInfo
    val targetItemInfo =
        updatedLayoutInfo.visibleItemsInfo.lastOrNull { it.index == lastIndex } ?: return
    val contentViewportEnd =
        updatedLayoutInfo.viewportEndOffset - updatedLayoutInfo.afterContentPadding
    val targetItemEnd = targetItemInfo.offset + targetItemInfo.size
    if (targetItemEnd <= contentViewportEnd && !canScrollBackward) {
        return
    }

    val targetTopOffset = contentViewportEnd - targetItemInfo.size
    val targetScrollOffset = -targetTopOffset

    if (
        firstVisibleItemIndex != lastIndex ||
            firstVisibleItemScrollOffset != targetScrollOffset
    ) {
        scrollToItem(lastIndex, targetScrollOffset)
    }
}
