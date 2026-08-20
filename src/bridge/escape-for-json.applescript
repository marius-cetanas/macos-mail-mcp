-- Escape a string for embedding in a JSON string literal.
--
-- ## One pass over code points, and no text item delimiters
--
-- Earlier versions escaped the named characters with five text-item-delimiter passes and then
-- swept the rest character by character. That shape kept producing bugs, and the last round
-- explained why: `text items of` does not have grapheme-cluster semantics, and it does not have
-- one consistent non-cluster semantics either. Measured on this handler's own inputs:
--
--   * backslash + U+0301 (combining mark)  -> 1 text item. The delimiter does not see inside.
--   * backslash + U+200D (ZWJ) + "A"       -> 2 text items. It DOES see inside, matches the
--                                             backslash, and orphans the ZWJ.
--   * quote + U+200C (ZWNJ) + "A"          -> 1 text item, though these are three separate
--                                             characters. It refuses to match a bare quote.
--
-- So whether a phase sees a character depended on which extender followed it. #33 fixed the
-- symptom for combining marks; a later fix judged code points inside clusters, which double-escaped
-- the ZWJ case because the phase had already inserted a backslash that then re-clustered. Each fix
-- was reasoned from one extender's behaviour and generalised to all of them.
--
-- `id of theString` has none of that. It returns the string's code points, flat: no clustering, no
-- collation, no matching. Every code point is then judged once, on its own, and nothing earlier in
-- the handler can have altered it. The cases above stop being special because there are no phases
-- left for them to be special about.
--
-- (`id of` returns a bare integer for a one-character string and an empty list for an empty one,
-- so the result is normalised to a list before the loop.)
on escapeForJson(theString)
    set codePoints to id of theString
    if class of codePoints is integer then set codePoints to {codePoints}

    set hexChars to "0123456789abcdef"
    set resultList to {}

    repeat with i from 1 to (count of codePoints)
        set pt to (item i of codePoints) as integer

        if pt = 34 then
            copy "\\\"" to end of resultList
        else if pt = 92 then
            copy "\\\\" to end of resultList
        else if pt = 9 then
            copy "\\t" to end of resultList
        else if pt = 10 then
            copy "\\n" to end of resultList
        else if pt = 13 then
            copy "\\r" to end of resultList
        else if pt >= 0 and pt <= 31 then
            -- The rest of C0. JSON requires these escaped and gives them no short form.
            set hi to (pt div 16) + 1
            set lo to (pt mod 16) + 1
            copy ("\\u00" & character hi of hexChars & character lo of hexChars) to end of resultList
        else
            copy (character id pt) to end of resultList
        end if
    end repeat

    set oldDelims to AppleScript's text item delimiters
    set AppleScript's text item delimiters to ""
    set resultStr to resultList as text
    set AppleScript's text item delimiters to oldDelims
    return resultStr
end escapeForJson
