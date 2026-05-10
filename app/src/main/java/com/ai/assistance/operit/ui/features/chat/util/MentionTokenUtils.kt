package com.ai.assistance.operit.ui.features.chat.util

data class MentionTokenRange(
    val start: Int,
    val contentEndExclusive: Int,
    val endExclusive: Int,
) {
    val hasTrailingWhitespace: Boolean
        get() = endExclusive > contentEndExclusive
}

fun isMentionContinuation(char: Char): Boolean {
    return (char.code in 0..127 && char.isLetterOrDigit()) ||
        char == '.' ||
        char == '_' ||
        char == '%' ||
        char == '+' ||
        char == '-'
}

fun findMentionTokens(text: String): List<MentionTokenRange> {
    if (text.indexOf('@') == -1) {
        return emptyList()
    }

    val tokens = mutableListOf<MentionTokenRange>()
    var index = 0
    while (index < text.length) {
        if (text[index] != '@') {
            index += 1
            continue
        }
        if (index > 0 && isMentionContinuation(text[index - 1])) {
            index += 1
            continue
        }

        var contentEnd = index + 1
        while (contentEnd < text.length && isMentionContinuation(text[contentEnd])) {
            contentEnd += 1
        }
        if (contentEnd == index + 1) {
            index += 1
            continue
        }

        val endExclusive =
            if (contentEnd < text.length && text[contentEnd].isWhitespace()) {
                contentEnd + 1
            } else {
                contentEnd
            }
        tokens += MentionTokenRange(index, contentEnd, endExclusive)
        index = contentEnd
    }
    return tokens
}

fun findCommittedMentionTokens(text: String): List<MentionTokenRange> {
    return findMentionTokens(text).filter(MentionTokenRange::hasTrailingWhitespace)
}

fun findMentionTokenEndingAtCursor(text: String, cursor: Int): MentionTokenRange? {
    val safeCursor = cursor.coerceIn(0, text.length)
    return findMentionTokens(text).firstOrNull { token ->
        safeCursor == token.contentEndExclusive || safeCursor == token.endExclusive
    }
}
