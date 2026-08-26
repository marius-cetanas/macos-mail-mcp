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
--
-- ## Why the list bookkeeping below looks fussy (#42)
--
-- The judging above is the whole of the correctness argument and is unchanged. Everything else in
-- this handler exists because AppleScript's list operations are not the complexities they look
-- like, and the earlier shape was quadratic in the length of the input. Measured on an M-series
-- Mac, escaping realistic email prose, wall clock including ~0.05s of `osascript` startup:
--
--   input     before     after
--    40,000    27.67s     0.28s
--   100,000       n/a     0.74s
--   200,000       n/a     2.45s
--
-- #42 guessed the cause was `copy ... to end of`. That is a real quadratic source and it was not
-- the only one, which is why fixing it alone measured as no improvement at all: element access was
-- quadratic too, and each masked the other. Four things were measured to be traps, and all four
-- have to be avoided together or the win does not appear:
--
--   * `item i of aList` on a plain variable falls off a cliff somewhere between 50,000 and 100,000
--     elements -- 0.08s to 86s for the read loop alone, with no escaping and no appends. Holding
--     the list in a script object property avoids that cliff, which is why `src` exists below.
--   * `items a thru b of aBigList` costs in proportion to `a`, so slicing a run out of the full
--     list once per escape is quadratic in the number of escapes. Runs are accumulated into a
--     small buffer instead.
--   * `count of aList` in the loop body is not free. Lengths are tracked in integers.
--   * appending without bound makes the target list large, which re-enters the first trap. Both
--     accumulators are flushed at `flushAt` so neither ever grows past it.
--
-- ## What this is NOT
--
-- It is not O(n), and this comment will not claim it is -- a false complexity claim in this very
-- header is the other half of what #42 reported. Past roughly 65,000 code points the single
-- unavoidable `item i of` walk over the full list starts to degrade again, so 200,000 costs rather
-- more than five times 40,000. What the shape below buys is that the degradation is gradual and
-- content-independent rather than sudden: escape density no longer matters, where before a body of
-- quotes cost an order of magnitude more than the same length of plain prose.
on escapeForJson(theString)
    set codePoints to id of theString
    if class of codePoints is integer then set codePoints to {codePoints}

    -- The list lives in a script object property for the whole walk. A plain variable holding a
    -- list this size is the 86-second case above.
    script src
        property pts : codePoints
    end script

    set pointCount to count of (pts of src)
    if pointCount = 0 then return ""

    set hexChars to "0123456789abcdef"

    -- Flush threshold for both accumulators. 500 keeps every list far below the size where access
    -- degrades, while amortising the join cost over enough elements to be worth doing.
    set flushAt to 500

    set blocks to {}
    set parts to {}
    set partsCount to 0
    set runBuf to {}
    set runCount to 0

    repeat with i from 1 to pointCount
        set pt to (item i of (pts of src)) as integer

        -- "" means this code point needs no escape. Every point is still judged on its own; the
        -- only change from the earlier shape is that the verdict is computed before it is acted on.
        set esc to ""

        if pt = 34 then
            set esc to "\\\""
        else if pt = 92 then
            set esc to "\\\\"
        else if pt = 9 then
            set esc to "\\t"
        else if pt = 10 then
            set esc to "\\n"
        else if pt = 13 then
            set esc to "\\r"
        else if pt >= 0 and pt <= 31 then
            -- The rest of C0. JSON requires these escaped and gives them no short form.
            set hi to (pt div 16) + 1
            set lo to (pt mod 16) + 1
            set esc to ("\\u00" & character hi of hexChars & character lo of hexChars)
        end if

        if esc is "" then
            -- Ordinary code point: hold it and convert the run in one `string id` call later,
            -- rather than one call per character.
            set end of runBuf to pt
            set runCount to runCount + 1
            if runCount >= flushAt then
                set end of parts to (string id runBuf)
                set partsCount to partsCount + 1
                set runBuf to {}
                set runCount to 0
            end if
        else
            if runCount > 0 then
                set end of parts to (string id runBuf)
                set partsCount to partsCount + 1
                set runBuf to {}
                set runCount to 0
            end if
            set end of parts to esc
            set partsCount to partsCount + 1
        end if

        if partsCount >= flushAt then
            set end of blocks to my joinStrings(parts)
            set parts to {}
            set partsCount to 0
        end if
    end repeat

    if runCount > 0 then
        set end of parts to (string id runBuf)
        set partsCount to partsCount + 1
    end if
    if partsCount > 0 then set end of blocks to my joinStrings(parts)

    return my joinStrings(blocks)
end escapeForJson

-- Concatenate a list of strings, restoring the caller's delimiters. Separate because the handler
-- above joins in three places and the save/restore has to be identical in each.
on joinStrings(theList)
    set oldDelims to AppleScript's text item delimiters
    set AppleScript's text item delimiters to ""
    set joined to theList as text
    set AppleScript's text item delimiters to oldDelims
    return joined
end joinStrings
