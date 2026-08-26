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
-- the only one, which is why fixing it alone measured as no improvement at all: 5.69s to 5.71s at
-- 20,000. Element access was quadratic too, and it dominated. Two things had to change together:
--
--   * **Element access on a plain variable is O(n) per element, at every size.** The read loop
--     alone -- no escaping, no appends -- costs 3.36s at 20,000, 10.16s at 35,000, 20.46s at
--     50,000 and 35.01s at 65,000. Holding the list in a script object property instead costs
--     0.09s at 20,000, 0.20s at 50,000, 0.60s at 100,000, 2.42s at 200,000. That is why `src`
--     exists below, and it is the larger half of the win.
--   * **Appending without bound makes the target list large, which re-enters the first trap.**
--     Both accumulators are flushed at `flushAt`, so neither ever grows past it.
--
-- An earlier draft of this comment claimed a cliff here -- "0.08s at 50,000, 86s at 100,000". That
-- reproduced from a benchmark whose 50,000-character input file did not exist, so the loop it timed
-- ran over an empty list. There is no cliff; the curve is smooth and quadratic throughout. The
-- correction is recorded rather than quietly applied because writing an unmeasured number into this
-- particular header is the defect #42 was half about.
--
-- Two further things this shape does, which measurement says are tidiness rather than speed:
--
--   * Runs are accumulated in a small buffer rather than sliced out of the full list with
--     `items a thru b`. That slice is not proportional to its start offset -- measured at 2.16s,
--     2.20s and 2.30s for 2,000 slices beginning at 1, 90,000 and 180,000 of a 200,000 list -- but
--     it does carry a large fixed per-call cost, so one per escape is still quadratic in the number
--     of escapes.
--   * `runCount` and `partsCount` are integers, but not because `count of` is expensive here:
--     against the small buffers it measures identically, 0.29s versus 0.28s at 40,960. `count of`
--     is only costly on a large plain-variable list, which is the first trap again rather than a
--     separate one.
--
-- ## What this is NOT
--
-- It is not O(n), and this comment will not claim it is -- a false complexity claim in this very
-- header is the other half of what #42 reported. Past roughly 65,000 code points the single
-- unavoidable `item i of` walk over the full list starts to degrade again, so 200,000 costs rather
-- more than five times 40,000.
--
-- **It is also not a fix for content-dependence, because there was none to fix.** The handler this
-- replaced was already flat across escape density -- 21.26s plain against 27.31s at 50% quotes, at
-- 40,960 -- and this one is flatter still. The shape that cost an order of magnitude more on dense
-- input was a *candidate for this rewrite* that sliced runs out of the full list, never anything
-- that shipped. The density test below is worth keeping precisely because it rules that candidate
-- out, but it is not describing a bug that users ever met.
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

        -- An empty `esc` means this code point needs no escape. Every point is still judged on its
        -- own; the only change from the earlier shape is that the verdict is computed before it is
        -- acted on.
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

        -- `(length of esc) = 0` and NOT `esc is ""`, which is a text comparison and therefore reads
        -- the caller's comparison attributes. Measured: inside `ignoring punctuation`, both
        -- `"\\\"" is ""` and `"\\\\" is ""` are TRUE, so the handler emitted `say "hi" b\s` —
        -- quote and backslash, the two JSON-structural characters, passed through raw. `length` is
        -- an integer and `= 0` is an integer comparison, which no attribute reaches. The handler
        -- this replaced compared integers throughout and was immune by construction; nothing in
        -- this repository sets those attributes today, so this is a guard rather than a fix.
        if (length of esc) = 0 then
            -- Ordinary code point: hold it and convert the run in one `string id` call later,
            -- rather than one call per character.
            set end of runBuf to pt
            set runCount to runCount + 1
            -- Every `string id runBuf` below is guarded by a non-zero count, and that guard is
            -- load-bearing in a way an error would not be: `string id {}` does not raise, it
            -- SEGFAULTS osascript (exit 139), and `try` cannot catch it. Merging these flush paths
            -- without keeping the guard turns a bad input into a crashed bridge process with no
            -- JSON and no error number to report.
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
