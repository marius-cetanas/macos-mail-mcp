on escapeForJson(theString)
    -- Use text item delimiters for O(n) performance instead of character-by-character O(n²)
    set oldDelims to AppleScript's text item delimiters

    -- Escape backslashes first
    set AppleScript's text item delimiters to "\\"
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\\\"
    set theString to parts as text

    -- Escape double quotes
    set AppleScript's text item delimiters to "\""
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\\""
    set theString to parts as text

    -- Escape tabs (ASCII 9)
    set AppleScript's text item delimiters to (ASCII character 9)
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\t"
    set theString to parts as text

    -- Escape newlines (ASCII 10)
    set AppleScript's text item delimiters to (ASCII character 10)
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\n"
    set theString to parts as text

    -- Escape carriage returns (ASCII 13)
    set AppleScript's text item delimiters to (ASCII character 13)
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\r"
    set theString to parts as text

    -- Escape other C0 control characters (0-8, 11-12, 14-31)
    -- "id of c" returns a LIST of code points, not an integer, when c is a multi-code-point
    -- grapheme cluster -- an emoji plus a variation selector, a base letter plus a combining
    -- diacritic (decomposed "é"), a ZWJ sequence. Comparing that list with ">=" raises
    -- "Can't make {...} into type number, date or text" (-1700), which is what #33 fixed.
    --
    -- #33 fixed it by escaping only when the id is a plain integer, on the reasoning that a real
    -- control character is always a single code point. That reasoning is wrong, and measurably:
    -- AppleScript clusters a C0 control with a following combining mark into ONE character, so
    -- `id of` returns {1, 769} and the whole cluster took the passthrough branch -- emitting a raw
    -- control character into a JSON string, which no parser accepts. #39.
    --
    -- So the id is normalised to a list and every code point is judged on its own. A cluster
    -- containing no control emits exactly the code points it arrived with, which is the same text;
    -- one that leads with a control gets the control escaped and the rest kept.
    set resultList to {}
    set hexChars to "0123456789abcdef"
    repeat with i from 1 to length of theString
        set c to character i of theString
        set cCode to id of c

        if class of cCode is integer then
            set codePoints to {cCode}
        else
            set codePoints to cCode
        end if

        repeat with j from 1 to (count of codePoints)
            set pt to (item j of codePoints) as integer
            if pt >= 0 and pt <= 31 then
                set hi to (pt div 16) + 1
                set lo to (pt mod 16) + 1
                copy ("\\u00" & character hi of hexChars & character lo of hexChars) to end of resultList
            else
                copy (character id pt) to end of resultList
            end if
        end repeat
    end repeat

    set AppleScript's text item delimiters to ""
    set resultStr to resultList as text
    set AppleScript's text item delimiters to oldDelims
    return resultStr
end escapeForJson
