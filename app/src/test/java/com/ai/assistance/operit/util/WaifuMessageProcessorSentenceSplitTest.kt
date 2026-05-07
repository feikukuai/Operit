package com.ai.assistance.operit.util

import org.junit.Assert.assertEquals
import org.junit.Test

class WaifuMessageProcessorSentenceSplitTest {
    @Test
    fun decimalNumber_isNotSplitByDot() {
        assertEquals(
            listOf("价格是 12.25 元。"),
            WaifuMessageProcessor.splitMessageBySentences("价格是 12.25 元。"),
        )
    }

    @Test
    fun versionNumber_isNotSplitByDot() {
        assertEquals(
            listOf("当前版本 v1.2 已发布。"),
            WaifuMessageProcessor.splitMessageBySentences("当前版本 v1.2 已发布。"),
        )
    }
}
